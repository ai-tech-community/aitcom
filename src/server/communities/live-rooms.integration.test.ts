// @vitest-environment node
/**
 * DB-INTEGRATION test for "Talking now" (`spaces.liveNow`). Proves, against
 * a REAL local DB, that only public, unarchived rooms of listed communities
 * with a message in the last day appear, with distinct people and agents
 * counted separately — and nothing about who wrote or what.
 *
 * Auto-skips unless RUN_DB_TESTS=1 and a local database is configured:
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/communities/live-rooms.integration.test.ts
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

describe.skipIf(!RUN_DB)("spaces.liveNow [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    inArray: typeof import("drizzle-orm").inArray;
    invalidate: typeof import("@/server/communities/live-rooms-queries").invalidateLiveRooms;
  };
  let m: Mods;

  type Fixture = {
    userIds: string[];
    communityIds: string[];
    spaceIds: string[];
    conversationIds: string[];
    talking: string;
    stale: string;
    privateRoom: string;
    unlistedRoom: string;
  };
  let fx: Fixture;

  beforeAll(async () => {
    const [{ db }, schema, { createCaller }, drizzle, { invalidateLiveRooms }] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("drizzle-orm"),
        import("@/server/communities/live-rooms-queries"),
      ]);
    m = {
      db,
      schema,
      createCaller,
      inArray: drizzle.inArray,
      invalidate: invalidateLiveRooms,
    };
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
  });

  beforeEach(async () => {
    const { db, schema } = m;
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const [owner, member, agent] = ["owner", "member", "agent"].map(
      (r) => `it-live-${r}-${suffix}`,
    ) as [string, string, string];
    for (const id of [owner, member, agent]) {
      await db
        .insert(schema.user)
        .values({ id, email: `${id}@example.test`, name: id });
    }

    const community = async (label: string, listed: boolean) => {
      const [row] = await db
        .insert(schema.communities)
        .values({
          name: `Live ${label} ${suffix}`,
          slug: `it-live-${label}-${suffix}`,
          createdBy: owner,
          isListedInDirectory: listed,
        })
        .returning({ id: schema.communities.id });
      return row!.id;
    };
    const listed = await community("listed", true);
    const unlisted = await community("unlisted", false);

    const room = async (
      communityId: string,
      label: string,
      visibility: "public" | "private",
    ) => {
      const [row] = await db
        .insert(schema.spaces)
        .values({
          communityId,
          kind: "room",
          visibility,
          name: label,
          slug: `${label}-${suffix}`,
          position: 100,
          createdBy: owner,
        })
        .returning({ id: schema.spaces.id });
      const [conv] = await db
        .insert(schema.conversations)
        .values({ type: "space", spaceId: row!.id })
        .returning({ id: schema.conversations.id });
      return { spaceId: row!.id, conversationId: conv!.id };
    };
    const talking = await room(listed, "talking", "public");
    const stale = await room(listed, "stale", "public");
    const privateRoom = await room(listed, "private", "private");
    const unlistedRoom = await room(unlisted, "unlisted", "public");

    const now = Date.now();
    const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000);
    await db.insert(schema.messages).values([
      {
        conversationId: talking.conversationId,
        senderId: owner,
        content: "hi",
        createdAt: at(3),
      },
      {
        conversationId: talking.conversationId,
        senderId: owner,
        content: "again",
        createdAt: at(2),
      },
      {
        conversationId: talking.conversationId,
        senderId: member,
        content: "hey",
        createdAt: at(1),
      },
      {
        conversationId: talking.conversationId,
        senderId: agent,
        senderType: "agent",
        content: "beep",
        createdAt: at(1),
      },
      {
        conversationId: stale.conversationId,
        senderId: owner,
        content: "old",
        createdAt: at(48),
      },
      {
        conversationId: privateRoom.conversationId,
        senderId: owner,
        content: "secret",
        createdAt: at(1),
      },
      {
        conversationId: unlistedRoom.conversationId,
        senderId: owner,
        content: "hidden",
        createdAt: at(1),
      },
    ]);

    fx = {
      userIds: [owner, member, agent],
      communityIds: [listed, unlisted],
      spaceIds: [talking, stale, privateRoom, unlistedRoom].map(
        (r) => r.spaceId,
      ),
      conversationIds: [talking, stale, privateRoom, unlistedRoom].map(
        (r) => r.conversationId,
      ),
      talking: talking.spaceId,
      stale: stale.spaceId,
      privateRoom: privateRoom.spaceId,
      unlistedRoom: unlistedRoom.spaceId,
    };
    m.invalidate();
  });

  afterEach(async () => {
    const { db, schema, inArray } = m;
    await db
      .delete(schema.messages)
      .where(inArray(schema.messages.conversationId, fx.conversationIds));
    await db
      .delete(schema.conversations)
      .where(inArray(schema.conversations.id, fx.conversationIds));
    await db
      .delete(schema.spaces)
      .where(inArray(schema.spaces.id, fx.spaceIds));
    await db
      .delete(schema.communities)
      .where(inArray(schema.communities.id, fx.communityIds));
    await db.delete(schema.user).where(inArray(schema.user.id, fx.userIds));
  });

  it("lists only public rooms of listed communities that talked in the last day", async () => {
    const caller = m.createCaller({
      db: m.db,
      session: null,
      headers: new Headers(),
    });
    const { rooms } = await caller.spaces.liveNow();
    const ours = rooms.filter((r) => fx.spaceIds.includes(r.spaceId));
    expect(ours.map((r) => r.spaceId)).toEqual([fx.talking]);
    expect(ours[0]).toMatchObject({ people: 2, agents: 1 });
    // Counts only: nothing about who wrote or what.
    expect(JSON.stringify(ours[0])).not.toContain("hey");
    expect(ours[0]).not.toHaveProperty("senderId");
  });
});
