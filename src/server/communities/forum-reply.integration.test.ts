// @vitest-environment node
/**
 * DB-INTEGRATION test for replying in a forum thread (`forum.addReply`,
 * `forum.deleteReply`). Proves, against a REAL local DB + Payload, that a
 * member's reply is saved, counted on the thread and bumps its activity,
 * and that deleting it takes it off the count again; and that the repair
 * migration recounts a thread whose stored count drifted.
 *
 * Auto-skips unless RUN_DB_TESTS=1 and a local database is configured:
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/communities/forum-reply.integration.test.ts
 */

import { sql } from "@payloadcms/db-postgres";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("forum reply counts [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    getPayloadClient: typeof import("@/server/payload").getPayloadClient;
    plainTextToLexical: typeof import("@/server/challenge-engine/lexical").plainTextToLexical;
    inArray: typeof import("drizzle-orm").inArray;
  };
  let m: Mods;
  let fx: {
    authorId: string;
    memberId: string;
    communityId: string;
    threadId: number;
  };

  beforeAll(async () => {
    const [
      { db },
      schema,
      { createCaller },
      { getPayloadClient },
      lexical,
      drizzle,
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/api/root"),
      import("@/server/payload"),
      import("@/server/challenge-engine/lexical"),
      import("drizzle-orm"),
    ]);
    m = {
      db,
      schema,
      createCaller,
      getPayloadClient,
      plainTextToLexical: lexical.plainTextToLexical,
      inArray: drizzle.inArray,
    };
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
  }, 120_000);

  beforeEach(async () => {
    const { db, schema } = m;
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const authorId = `it-reply-a-${suffix}`;
    const memberId = `it-reply-m-${suffix}`;
    await db.insert(schema.user).values([
      { id: authorId, email: `${authorId}@example.test`, name: authorId },
      { id: memberId, email: `${memberId}@example.test`, name: memberId },
    ]);
    const [community] = await db
      .insert(schema.communities)
      .values({
        name: `Reply ${suffix}`,
        slug: `it-reply-${suffix}`,
        createdBy: authorId,
      })
      .returning({ id: schema.communities.id });
    await db.insert(schema.communityMemberships).values([
      { communityId: community!.id, userId: authorId, role: "owner" },
      { communityId: community!.id, userId: memberId, role: "member" },
    ]);
    const payload = await m.getPayloadClient();
    const thread = await payload.create({
      collection: "forum-threads",
      data: {
        title: `Welcome ${suffix}`,
        slug: `it-reply-${suffix}`,
        content: m.plainTextToLexical("Say hello"),
        category: "general",
        authorId,
        authorName: "Author",
        communityId: community!.id,
        lastActivityAt: "2026-01-01T00:00:00.000Z",
      },
    });
    fx = {
      authorId,
      memberId,
      communityId: community!.id,
      threadId: thread.id,
    };
  });

  afterEach(async () => {
    const { db, schema, inArray } = m;
    const payload = await m.getPayloadClient();
    try {
      await payload.delete({
        collection: "forum-replies",
        where: { thread: { equals: fx.threadId } },
      });
      await payload.delete({ collection: "forum-threads", id: fx.threadId });
    } catch {
      // Best-effort teardown.
    }
    await db
      .delete(schema.communityMemberships)
      .where(
        inArray(schema.communityMemberships.communityId, [fx.communityId]),
      );
    await db
      .delete(schema.communities)
      .where(inArray(schema.communities.id, [fx.communityId]));
    await db
      .delete(schema.user)
      .where(inArray(schema.user.id, [fx.authorId, fx.memberId]));
  });

  async function thread() {
    const payload = await m.getPayloadClient();
    return payload.findByID({
      collection: "forum-threads",
      id: fx.threadId,
      depth: 0,
    });
  }

  it("saves a member's reply, counts it and bumps the thread's activity", async () => {
    const member = m.createCaller({
      db: m.db,
      session: { user: { id: fx.memberId, name: "Member" } } as never,
      headers: new Headers(),
    });

    const reply = await member.forum.addReply({
      threadId: fx.threadId,
      content: "Hey hey!!! welcome",
    });

    const after = await thread();
    expect(after.replyCount).toBe(1);
    expect(new Date(after.lastActivityAt!).getTime()).toBeGreaterThan(
      new Date("2026-01-01T00:00:00.000Z").getTime(),
    );

    await member.forum.deleteReply({ replyId: reply.id });
    expect((await thread()).replyCount).toBe(0);
  }, 30_000);

  it("recounts a drifted thread with the repair migration", async () => {
    const payload = await m.getPayloadClient();
    await payload.create({
      collection: "forum-replies",
      data: {
        thread: fx.threadId,
        content: m.plainTextToLexical("Counted"),
        authorId: fx.memberId,
        communityId: fx.communityId,
      },
    });
    await payload.db.drizzle.execute(
      sql`UPDATE "forum_threads" SET "reply_count" = 7 WHERE "id" = ${fx.threadId}`,
    );

    const { up } =
      await import("@/migrations/20261008a_forum_reply_count_repair");
    await up({ db: payload.db.drizzle, payload, req: {} } as never);

    expect((await thread()).replyCount).toBe(1);
  }, 30_000);
});
