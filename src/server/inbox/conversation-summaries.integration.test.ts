// @vitest-environment node
/**
 * DB-INTEGRATION test for `inbox.getConversation`, the one-conversation
 * twin of `inbox.listConversations`. Proves, against a REAL local DB, that
 * it gives the very summary the list gives, that it finds a conversation the
 * list's first page does not reach, and that it refuses (NOT_FOUND) a
 * conversation the caller is not in and a room they are not an active
 * member of.
 *
 * Auto-skips unless RUN_DB_TESTS=1 and a local database is configured:
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/inbox/conversation-summaries.integration.test.ts
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { createCaller as CreateCaller } from "@/server/api/root";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type * as HubDmMail from "@/server/notifications/hub-dm-mail";
import type { inArray as InArray } from "drizzle-orm";

vi.mock("@/server/inbox/publish", () => ({
  publishInboxEvent: async () => undefined,
}));
vi.mock("@/server/agent/activity", () => ({
  logActivity: async () => undefined,
}));
vi.mock("@/server/notifications/hub-dm-mail", async (importOriginal) => ({
  ...(await importOriginal<typeof HubDmMail>()),
  scheduleUnreadHubDmNotify: () => undefined,
}));

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

describe.skipIf(!RUN_DB)("inbox.getConversation [DB integration]", () => {
  type Mods = {
    db: typeof Db;
    schema: typeof Schema;
    createCaller: typeof CreateCaller;
    inArray: typeof InArray;
  };
  let m: Mods;
  let fx: {
    sender: string;
    friend: string;
    outsider: string;
    dm: string;
    room: string;
    spaceId: string;
    communityId: string;
  };
  /** Every conversation a test made, removed after it. */
  let conversationIds: string[];

  beforeAll(async () => {
    const [{ db }, schema, { createCaller }, drizzle] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/api/root"),
      import("drizzle-orm"),
    ]);
    m = { db, schema, createCaller, inArray: drizzle.inArray };
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
  });

  beforeEach(async () => {
    const { db, schema } = m;
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const [sender, friend, outsider] = ["sender", "friend", "outsider"].map(
      (r) => `it-conv-sum-${r}-${suffix}`,
    ) as [string, string, string];
    for (const id of [sender, friend, outsider]) {
      await db
        .insert(schema.user)
        .values({ id, email: `${id}@example.test`, name: id });
    }

    const [dm] = await db
      .insert(schema.conversations)
      .values({ type: "dm" })
      .returning({ id: schema.conversations.id });
    await db.insert(schema.conversationParticipants).values([
      { conversationId: dm!.id, userId: sender },
      { conversationId: dm!.id, userId: friend },
    ]);
    await db.insert(schema.messages).values({
      conversationId: dm!.id,
      senderType: "human",
      senderId: friend,
      content: "hello there",
    });

    // A room the sender is an active member of; the outsider belongs to the
    // community but has only asked to join the room.
    const [community] = await db
      .insert(schema.communities)
      .values({
        name: `Summary room ${suffix}`,
        slug: `it-conv-sum-${suffix}`,
        createdBy: sender,
      })
      .returning({ id: schema.communities.id });
    await db.insert(schema.communityMemberships).values(
      [sender, outsider].map((userId) => ({
        communityId: community!.id,
        userId,
        status: "active" as const,
      })),
    );
    const [space] = await db
      .insert(schema.spaces)
      .values({
        communityId: community!.id,
        kind: "room",
        visibility: "private",
        name: "Back room",
        slug: `back-room-${suffix}`,
        position: 100,
        createdBy: sender,
      })
      .returning({ id: schema.spaces.id });
    await db.insert(schema.spaceMemberships).values([
      { spaceId: space!.id, userId: sender, status: "active" as const },
      {
        spaceId: space!.id,
        userId: outsider,
        status: "pending_request" as const,
      },
    ]);
    const [room] = await db
      .insert(schema.conversations)
      .values({ type: "space", spaceId: space!.id })
      .returning({ id: schema.conversations.id });

    conversationIds = [dm!.id, room!.id];
    fx = {
      sender,
      friend,
      outsider,
      dm: dm!.id,
      room: room!.id,
      spaceId: space!.id,
      communityId: community!.id,
    };
  });

  afterEach(async () => {
    const { db, schema, inArray } = m;
    const userIds = [fx.sender, fx.friend, fx.outsider];
    await db
      .delete(schema.messages)
      .where(inArray(schema.messages.conversationId, conversationIds));
    await db
      .delete(schema.conversationParticipants)
      .where(
        inArray(
          schema.conversationParticipants.conversationId,
          conversationIds,
        ),
      );
    await db
      .delete(schema.conversations)
      .where(inArray(schema.conversations.id, conversationIds));
    await db
      .delete(schema.spaceMemberships)
      .where(inArray(schema.spaceMemberships.spaceId, [fx.spaceId]));
    await db
      .delete(schema.spaces)
      .where(inArray(schema.spaces.id, [fx.spaceId]));
    await db
      .delete(schema.communityMemberships)
      .where(
        inArray(schema.communityMemberships.communityId, [fx.communityId]),
      );
    await db
      .delete(schema.communities)
      .where(inArray(schema.communities.id, [fx.communityId]));
    await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  });

  function callerAs(userId: string) {
    return m.createCaller({
      db: m.db,
      headers: new Headers(),
      session: { user: { id: userId, name: "Tester" }, session: {} } as never,
    });
  }

  it("getConversation returns the same summary listConversations gives", async () => {
    const caller = callerAs(fx.sender);
    const { conversations } = await caller.inbox.listConversations({
      limit: 50,
    });
    const listedDm = conversations.find((c) => c.id === fx.dm);
    const listedRoom = conversations.find((c) => c.id === fx.room);
    expect(listedDm).toBeDefined();
    expect(listedRoom).toBeDefined();

    expect(
      await caller.inbox.getConversation({ conversationId: fx.dm }),
    ).toEqual(listedDm);
    expect(
      await caller.inbox.getConversation({ conversationId: fx.room }),
    ).toEqual(listedRoom);
  });

  it("getConversation finds a conversation beyond the first page", async () => {
    const { db, schema } = m;
    // 31 dms with the friend, the oldest updated first.
    const base = Date.now() - 31 * 60_000;
    const made: string[] = [];
    for (let i = 0; i < 31; i++) {
      const [conversation] = await db
        .insert(schema.conversations)
        .values({ type: "dm", updatedAt: new Date(base + i * 60_000) })
        .returning({ id: schema.conversations.id });
      made.push(conversation!.id);
    }
    conversationIds.push(...made);
    await db.insert(schema.conversationParticipants).values(
      made.flatMap((conversationId) => [
        { conversationId, userId: fx.sender },
        { conversationId, userId: fx.friend },
      ]),
    );
    const oldest = made[0]!;

    const caller = callerAs(fx.sender);
    const firstPage = await caller.inbox.listConversations({ limit: 30 });
    expect(firstPage.conversations.map((c) => c.id)).not.toContain(oldest);

    const found = await caller.inbox.getConversation({
      conversationId: oldest,
    });
    expect(found).toMatchObject({
      id: oldest,
      type: "dm",
      isRoom: false,
      participants: [expect.objectContaining({ userId: fx.friend })],
    });
  });

  it("getConversation refuses a conversation the caller is not in", async () => {
    await expect(
      callerAs(fx.outsider).inbox.getConversation({ conversationId: fx.dm }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("getConversation refuses a room the caller is not an active member of", async () => {
    await expect(
      callerAs(fx.outsider).inbox.getConversation({ conversationId: fx.room }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      callerAs(fx.friend).inbox.getConversation({ conversationId: fx.room }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
