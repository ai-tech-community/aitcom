// @vitest-environment node
/**
 * DB-INTEGRATION test for messages that carry a GIF (`inbox.sendMessage`
 * with `gif`, `inbox.getMessages`). Proves, against a REAL local DB, that a
 * GIF picked by its GIPHY id is stored as one `gif` attachment of the
 * message and comes back on reads, in a direct message and in a room; that
 * a message needs words or a GIF; and that a GIF into an agent conversation,
 * or one GIPHY does not know, is refused without storing a message. Also
 * proves the readers that show only text know about the GIF: the
 * conversation list's last message, an agent reading its owner's DMs, and
 * account deletion.
 *
 * Auto-skips unless RUN_DB_TESTS=1 and a local database is configured:
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/inbox/message-attachments.integration.test.ts
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
import type { deleteMemberAccount as DeleteMemberAccount } from "@/server/members/delete-account";
import type * as HubDmMail from "@/server/notifications/hub-dm-mail";
import type { eq as Eq, inArray as InArray } from "drizzle-orm";

const gif = vi.hoisted(() => ({
  giphyId: "abc123",
  title: "Happy dance",
  mp4Url: "https://media.giphy.com/media/abc123/giphy.mp4",
  stillUrl: "https://media.giphy.com/media/abc123/giphy_s.gif",
  width: 400,
  height: 300,
  preview: {
    mp4Url: "https://media.giphy.com/media/abc123/200w.mp4",
    stillUrl: "https://media.giphy.com/media/abc123/200w_s.gif",
    width: 200,
    height: 150,
  },
}));
const giphy = vi.hoisted(() => ({
  byId: vi.fn(async (id: string) => (id === gif.giphyId ? gif : null)),
}));
vi.mock("@/server/giphy/giphy", () => ({ getGiphyClient: () => giphy }));
/** The agent whose API key the agent calls in these tests carry. */
const agentKey = vi.hoisted(() => ({ agentId: "", ownerId: "" }));
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: async () => ({
    agentId: agentKey.agentId,
    ownerId: agentKey.ownerId,
    scopes: ["read"],
    status: "active",
  }),
}));
const published = vi.hoisted(
  () => [] as { userId: string; payload: unknown }[],
);
vi.mock("@/server/inbox/publish", () => ({
  publishInboxEvent: async (userId: string, payload: unknown) => {
    published.push({ userId, payload });
  },
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

describe.skipIf(!RUN_DB)("inbox messages with a GIF [DB integration]", () => {
  type Mods = {
    db: typeof Db;
    schema: typeof Schema;
    createCaller: typeof CreateCaller;
    eq: typeof Eq;
    inArray: typeof InArray;
    deleteMemberAccount: typeof DeleteMemberAccount;
  };
  let m: Mods;
  let fx: {
    sender: string;
    friend: string;
    roomMate: string;
    dm: string;
    agentChat: string;
    room: string;
    spaceId: string;
    communityId: string;
    agentId: string;
  };

  beforeAll(async () => {
    const [{ db }, schema, { createCaller }, drizzle, { deleteMemberAccount }] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("drizzle-orm"),
        import("@/server/members/delete-account"),
      ]);
    m = {
      db,
      schema,
      createCaller,
      eq: drizzle.eq,
      inArray: drizzle.inArray,
      deleteMemberAccount,
    };
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
  });

  beforeEach(async () => {
    const { db, schema } = m;
    published.length = 0;
    giphy.byId.mockClear();
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const [sender, friend, roomMate] = ["sender", "friend", "mate"].map(
      (r) => `it-msg-gif-${r}-${suffix}`,
    ) as [string, string, string];
    for (const id of [sender, friend, roomMate]) {
      await db
        .insert(schema.user)
        .values({ id, email: `${id}@example.test`, name: id });
    }

    const [dm] = await db
      .insert(schema.conversations)
      .values({ type: "dm" })
      .returning({ id: schema.conversations.id });
    const [agentChat] = await db
      .insert(schema.conversations)
      .values({ type: "agent" })
      .returning({ id: schema.conversations.id });
    await db.insert(schema.conversationParticipants).values([
      { conversationId: dm!.id, userId: sender },
      { conversationId: dm!.id, userId: friend },
      { conversationId: agentChat!.id, userId: sender },
    ]);

    const [community] = await db
      .insert(schema.communities)
      .values({
        name: `GIF room ${suffix}`,
        slug: `it-msg-gif-${suffix}`,
        createdBy: sender,
      })
      .returning({ id: schema.communities.id });
    await db.insert(schema.communityMemberships).values(
      [sender, roomMate].map((userId) => ({
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
        visibility: "public",
        name: "Lounge",
        slug: `lounge-${suffix}`,
        position: 100,
        createdBy: sender,
      })
      .returning({ id: schema.spaces.id });
    await db.insert(schema.spaceMemberships).values(
      [sender, roomMate].map((userId) => ({
        spaceId: space!.id,
        userId,
        status: "active" as const,
      })),
    );
    const [room] = await db
      .insert(schema.conversations)
      .values({ type: "space", spaceId: space!.id })
      .returning({ id: schema.conversations.id });

    // The friend's agent, allowed to read its owner's DMs.
    const [agent] = await db
      .insert(schema.agentProfiles)
      .values({
        ownerId: friend,
        name: `GIF reader ${suffix}`,
        canReadOwnerDMs: true,
      })
      .returning({ id: schema.agentProfiles.id });
    agentKey.agentId = agent!.id;
    agentKey.ownerId = friend;

    fx = {
      sender,
      friend,
      roomMate,
      dm: dm!.id,
      agentChat: agentChat!.id,
      room: room!.id,
      spaceId: space!.id,
      communityId: community!.id,
      agentId: agent!.id,
    };
  });

  afterEach(async () => {
    const { db, schema, inArray } = m;
    const conversationIds = [fx.dm, fx.agentChat, fx.room];
    const userIds = [fx.sender, fx.friend, fx.roomMate];
    // Attachments go with their message (ON DELETE CASCADE).
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
    await db
      .delete(schema.agentProfiles)
      .where(inArray(schema.agentProfiles.id, [fx.agentId]));
    await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  });

  function callerAs(userId: string) {
    return m.createCaller({
      db: m.db,
      headers: new Headers(),
      session: { user: { id: userId, name: "Tester" }, session: {} } as never,
    });
  }

  /** A call made with the friend's agent API key. */
  function agentCaller() {
    return m.createCaller({
      db: m.db,
      headers: new Headers({ authorization: "Bearer test-key" }),
      session: null,
    });
  }

  async function messageCount(conversationId: string): Promise<number> {
    const rows = await m.db
      .select({ id: m.schema.messages.id })
      .from(m.schema.messages)
      .where(m.eq(m.schema.messages.conversationId, conversationId));
    return rows.length;
  }

  const storedGif = {
    kind: "gif",
    position: 0,
    title: gif.title,
    mp4Url: gif.mp4Url,
    stillUrl: gif.stillUrl,
    width: gif.width,
    height: gif.height,
  };

  it("a dm message with a GIF stores one gif attachment and getMessages returns it", async () => {
    const sent = await callerAs(fx.sender).inbox.sendMessage({
      conversationId: fx.dm,
      content: "look",
      gif: { giphyId: gif.giphyId },
    });
    expect(sent.content).toBe("look");
    expect(sent.attachments).toEqual([expect.objectContaining(storedGif)]);
    // The GIF's addresses come from GIPHY, looked up by its id.
    expect(giphy.byId).toHaveBeenCalledWith(gif.giphyId);

    const rows = await m.db
      .select()
      .from(m.schema.messageAttachments)
      .where(m.eq(m.schema.messageAttachments.messageId, sent.id));
    expect(rows).toEqual([
      expect.objectContaining({ ...storedGif, giphyId: gif.giphyId }),
    ]);

    const { messages } = await callerAs(fx.friend).inbox.getMessages({
      conversationId: fx.dm,
    });
    expect(messages).toEqual([
      expect.objectContaining({
        id: sent.id,
        attachments: [expect.objectContaining(storedGif)],
      }),
    ]);

    // The realtime payload carries the same message, attachments included.
    expect(published).toContainEqual({
      userId: fx.friend,
      payload: expect.objectContaining({ kind: "message", message: sent }),
    });
  });

  it("a GIF-only message is accepted", async () => {
    const sent = await callerAs(fx.sender).inbox.sendMessage({
      conversationId: fx.dm,
      content: "",
      gif: { giphyId: gif.giphyId },
    });
    expect(sent.content).toBe("");
    expect(sent.attachments).toHaveLength(1);
  });

  it("a message with no words and no GIF is refused", async () => {
    await expect(
      callerAs(fx.sender).inbox.sendMessage({
        conversationId: fx.dm,
        content: "   ",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("A message needs words or a GIF."),
    });
    expect(await messageCount(fx.dm)).toBe(0);
  });

  it("a room message with a GIF reaches getMessages for another room member", async () => {
    const sent = await callerAs(fx.sender).inbox.sendMessage({
      conversationId: fx.room,
      content: "",
      gif: { giphyId: gif.giphyId },
    });
    expect(sent.attachments).toEqual([expect.objectContaining(storedGif)]);

    const { messages } = await callerAs(fx.roomMate).inbox.getMessages({
      conversationId: fx.room,
    });
    expect(messages).toEqual([
      expect.objectContaining({
        id: sent.id,
        attachments: [expect.objectContaining(storedGif)],
      }),
    ]);
    expect(published).toContainEqual({
      userId: fx.roomMate,
      payload: expect.objectContaining({ kind: "message", message: sent }),
    });
  });

  it("a GIF into an agent conversation is refused and stores no message", async () => {
    const before = await messageCount(fx.agentChat);
    await expect(
      callerAs(fx.sender).inbox.sendMessage({
        conversationId: fx.agentChat,
        content: "hello",
        gif: { giphyId: gif.giphyId },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "GIFs can't be sent to an agent.",
    });
    expect(await messageCount(fx.agentChat)).toBe(before);
    expect(giphy.byId).not.toHaveBeenCalled();
  });

  it("a GIF GIPHY does not know is refused and stores no message", async () => {
    const before = await messageCount(fx.dm);
    await expect(
      callerAs(fx.sender).inbox.sendMessage({
        conversationId: fx.dm,
        content: "look",
        gif: { giphyId: "gone" },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "That GIF is not available. Pick another one.",
    });
    expect(await messageCount(fx.dm)).toBe(before);
  });

  it("listConversations marks a GIF-only last message", async () => {
    await callerAs(fx.sender).inbox.sendMessage({
      conversationId: fx.dm,
      content: "",
      gif: { giphyId: gif.giphyId },
    });
    await callerAs(fx.sender).inbox.sendMessage({
      conversationId: fx.room,
      content: "hi room",
    });

    const { conversations } = await callerAs(fx.sender).inbox.listConversations(
      { limit: 50 },
    );
    const lastOf = (id: string) =>
      conversations.find((conversation) => conversation.id === id)?.lastMessage;

    expect(lastOf(fx.dm)).toMatchObject({ content: "", attachmentKind: "gif" });
    // A message with only words carries no attachment kind.
    expect(lastOf(fx.room)).toMatchObject({
      content: "hi room",
      attachmentKind: null,
    });
  });

  it("agentGetOwnerDMs shows a GIF as text", async () => {
    const sent = await callerAs(fx.sender).inbox.sendMessage({
      conversationId: fx.dm,
      content: "",
      gif: { giphyId: gif.giphyId },
    });

    const { messages } = await agentCaller().inbox.agentGetOwnerDMs({});

    expect(messages).toContainEqual(
      expect.objectContaining({ id: sent.id, content: "[GIF: Happy dance]" }),
    );
  });

  it("deleting an account removes the member's message attachments", async () => {
    await callerAs(fx.friend).inbox.sendMessage({
      conversationId: fx.dm,
      content: "",
      gif: { giphyId: gif.giphyId },
    });
    const kept = await callerAs(fx.sender).inbox.sendMessage({
      conversationId: fx.dm,
      content: "",
      gif: { giphyId: gif.giphyId },
    });

    await m.deleteMemberAccount(m.db, fx.friend);

    const attachmentsOf = (senderId: string) =>
      m.db
        .select({ id: m.schema.messageAttachments.id })
        .from(m.schema.messageAttachments)
        .innerJoin(
          m.schema.messages,
          m.eq(m.schema.messages.id, m.schema.messageAttachments.messageId),
        )
        .where(m.eq(m.schema.messages.senderId, senderId));
    expect(await attachmentsOf(fx.friend)).toEqual([]);
    // The other member's GIF stays.
    expect(await attachmentsOf(fx.sender)).toEqual([
      { id: kept.attachments[0]!.id },
    ]);
  });
});
