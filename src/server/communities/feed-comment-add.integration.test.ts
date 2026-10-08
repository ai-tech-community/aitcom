// @vitest-environment node
/**
 * DB-INTEGRATION test for commenting on a feed post (`feed.addComment`).
 * Proves, against a REAL local DB + Payload, that a member's comment on
 * another member's post is saved and counted.
 *
 * Auto-skips unless RUN_DB_TESTS=1 and a local database is configured:
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/communities/feed-comment-add.integration.test.ts
 */

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

describe.skipIf(!RUN_DB)("feed.addComment [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    getPayloadClient: typeof import("@/server/payload").getPayloadClient;
    inArray: typeof import("drizzle-orm").inArray;
  };
  let m: Mods;
  let fx: {
    authorId: string;
    memberId: string;
    communityId: string;
    postId: number;
  };

  beforeAll(async () => {
    const [{ db }, schema, { createCaller }, { getPayloadClient }, drizzle] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/payload"),
        import("drizzle-orm"),
      ]);
    m = { db, schema, createCaller, getPayloadClient, inArray: drizzle.inArray };
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
  });

  beforeEach(async () => {
    const { db, schema } = m;
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const authorId = `it-comment-a-${suffix}`;
    const memberId = `it-comment-m-${suffix}`;
    await db.insert(schema.user).values([
      { id: authorId, email: `${authorId}@example.test`, name: authorId },
      { id: memberId, email: `${memberId}@example.test`, name: memberId },
    ]);
    const [community] = await db
      .insert(schema.communities)
      .values({
        name: `Comment ${suffix}`,
        slug: `it-comment-${suffix}`,
        createdBy: authorId,
      })
      .returning({ id: schema.communities.id });
    await db.insert(schema.communityMemberships).values([
      { communityId: community!.id, userId: authorId, role: "owner" },
      { communityId: community!.id, userId: memberId, role: "member" },
    ]);
    const payload = await m.getPayloadClient();
    const post = await payload.create({
      collection: "feed-posts",
      data: {
        content: "Hey everyone :)",
        authorId,
        authorName: "Author",
        communityId: community!.id,
        topicSlug: "general",
        likeCount: 0,
        commentCount: 0,
        visibility: "community",
      },
    });
    fx = { authorId, memberId, communityId: community!.id, postId: post.id };
  });

  afterEach(async () => {
    const { db, schema, inArray } = m;
    const payload = await m.getPayloadClient();
    try {
      await payload.delete({
        collection: "feed-comments",
        where: { post: { equals: fx.postId } },
      });
      await payload.delete({ collection: "feed-posts", id: fx.postId });
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

  it("saves a member's comment on another member's post and counts it", async () => {
    const member = m.createCaller({
      db: m.db,
      session: { user: { id: fx.memberId, name: "Member" } } as never,
      headers: new Headers(),
    });

    const comment = await member.feed.addComment({
      postId: fx.postId,
      content: "Hey hey!!! welcome",
    });

    expect(comment.content).toBe("Hey hey!!! welcome");
    const payload = await m.getPayloadClient();
    const post = await payload.findByID({
      collection: "feed-posts",
      id: fx.postId,
      depth: 0,
    });
    expect(post.commentCount).toBe(1);
  }, 20_000);
});
