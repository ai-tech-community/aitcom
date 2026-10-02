// @vitest-environment node
/**
 * DB-INTEGRATION test for the database-backed Next up loaders (invites,
 * join requests, unread) against a REAL local database.
 *
 * Auto-skips unless RUN_DB_TESTS=1 and a local database is configured:
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/home/next-up/loaders/db-loaders.integration.test.ts
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { inArray as InArray } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { NextUpContext } from "../types";
import type { loadInviteItems } from "./invites";
import type { loadJoinRequestItems } from "./join-requests";
import type { loadUnreadItems } from "./unread";

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

type Role = "owner" | "admin" | "moderator" | "member";
type Status = "active" | "pending_approval" | "invited" | "banned";

describe.skipIf(!RUN_DB)("Next up DB loaders [DB integration]", () => {
  // Loaded lazily so a skipped run never opens a database connection.
  let db: typeof Db;
  let schema: typeof Schema;
  let inArray: typeof InArray;
  let loaders: {
    invites: typeof loadInviteItems;
    joinRequests: typeof loadJoinRequestItems;
    unread: typeof loadUnreadItems;
  };

  let sfx = "";
  let me = "";
  const userIds: string[] = [];
  const communityIds: string[] = [];
  const conversationIds: string[] = [];

  beforeAll(async () => {
    const [dbMod, schemaMod, orm, invites, joinRequests, unread] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("drizzle-orm"),
        import("./invites"),
        import("./join-requests"),
        import("./unread"),
      ]);
    db = dbMod.db;
    schema = schemaMod;
    inArray = orm.inArray;
    loaders = {
      invites: invites.loadInviteItems,
      joinRequests: joinRequests.loadJoinRequestItems,
      unread: unread.loadUnreadItems,
    };
  });

  function ctx(): NextUpContext {
    return {
      db,
      userId: me,
      locale: "en",
      now: new Date(),
      getPayload: () => {
        throw new Error("DB loaders must not use Payload");
      },
    };
  }

  async function addUser(name: string): Promise<string> {
    const id = `nu-${name}-${userIds.length}-${sfx}`;
    userIds.push(id);
    await db
      .insert(schema.user)
      .values({ id, email: `${id}@example.test`, name });
    return id;
  }

  async function addCommunity(
    name: string,
    opts: { deleted?: boolean } = {},
  ): Promise<{ id: string; slug: string; name: string }> {
    const [row] = await db
      .insert(schema.communities)
      .values({
        name: `${name} ${sfx}`,
        slug: `${name.toLowerCase()}-${sfx}`,
        createdBy: me,
        deletedAt: opts.deleted ? new Date() : null,
      })
      .returning();
    communityIds.push(row!.id);
    return { id: row!.id, slug: row!.slug, name: row!.name };
  }

  async function addMembership(
    communityId: string,
    userId: string,
    role: Role,
    status: Status,
  ) {
    await db
      .insert(schema.communityMemberships)
      .values({ communityId, userId, role, status });
  }

  /** `n` other people asking to join the community. */
  async function addPending(communityId: string, n: number) {
    for (let i = 0; i < n; i++) {
      const u = await addUser(`req${i}`);
      await addMembership(communityId, u, "member", "pending_approval");
    }
  }

  beforeEach(async () => {
    sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    me = await addUser("me");
  });

  afterEach(async () => {
    if (conversationIds.length > 0) {
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
    }
    if (communityIds.length > 0) {
      await db
        .delete(schema.communityMemberships)
        .where(inArray(schema.communityMemberships.communityId, communityIds));
      await db
        .delete(schema.communities)
        .where(inArray(schema.communities.id, communityIds));
    }
    if (userIds.length > 0) {
      await db
        .delete(schema.notifications)
        .where(inArray(schema.notifications.userId, userIds));
      await db.delete(schema.user).where(inArray(schema.user.id, userIds));
    }
    userIds.length = 0;
    communityIds.length = 0;
    conversationIds.length = 0;
  });

  describe("invites", () => {
    it("lists only communities where my membership is invited", async () => {
      const invitedTo = await addCommunity("Invited");
      const memberOf = await addCommunity("Member");
      const askedToJoin = await addCommunity("Asked");
      const gone = await addCommunity("Gone", { deleted: true });
      await addMembership(invitedTo.id, me, "member", "invited");
      await addMembership(memberOf.id, me, "member", "active");
      await addMembership(askedToJoin.id, me, "member", "pending_approval");
      await addMembership(gone.id, me, "member", "invited");

      const items = await loaders.invites(ctx());

      expect(items).toEqual([
        {
          kind: "invite",
          key: `invite:${invitedTo.id}`,
          urgency: { tier: "actionNeeded" },
          communityId: invitedTo.id,
          slug: invitedTo.slug,
          name: invitedTo.name,
        },
      ]);
    });

    it("is empty without invitations", async () => {
      expect(await loaders.invites(ctx())).toEqual([]);
    });
  });

  describe("joinRequests", () => {
    it("counts pending requests per community I own or administer, and only those with requests", async () => {
      const owned = await addCommunity("Owned");
      const administered = await addCommunity("Administered");
      const quiet = await addCommunity("Quiet");
      await addMembership(owned.id, me, "owner", "active");
      await addMembership(administered.id, me, "admin", "active");
      await addMembership(quiet.id, me, "admin", "active");
      await addPending(owned.id, 3);
      await addPending(administered.id, 1);
      // Members who are already in, invited or banned are not requests.
      const other = await addUser("other");
      await addMembership(quiet.id, other, "member", "active");
      const invitee = await addUser("invitee");
      await addMembership(owned.id, invitee, "member", "invited");

      const items = await loaders.joinRequests(ctx());

      expect(
        items.map(({ communityId, count, slug, name, kind, urgency }) => ({
          communityId,
          count,
          slug,
          name,
          kind,
          urgency,
        })),
      ).toEqual([
        {
          communityId: administered.id,
          count: 1,
          slug: administered.slug,
          name: administered.name,
          kind: "joinRequests",
          urgency: { tier: "actionNeeded" },
        },
        {
          communityId: owned.id,
          count: 3,
          slug: owned.slug,
          name: owned.name,
          kind: "joinRequests",
          urgency: { tier: "actionNeeded" },
        },
      ]);
    });

    it("does not count communities where I am only a member or moderator", async () => {
      const asMember = await addCommunity("AsMember");
      const asModerator = await addCommunity("AsModerator");
      await addMembership(asMember.id, me, "member", "active");
      await addMembership(asModerator.id, me, "moderator", "active");
      await addPending(asMember.id, 2);
      await addPending(asModerator.id, 2);

      expect(await loaders.joinRequests(ctx())).toEqual([]);
    });

    it("ignores admin roles I do not hold yet, and deleted communities", async () => {
      const invitedAsAdmin = await addCommunity("InvitedAdmin");
      const deleted = await addCommunity("Deleted", { deleted: true });
      await addMembership(invitedAsAdmin.id, me, "admin", "invited");
      await addMembership(deleted.id, me, "owner", "active");
      await addPending(invitedAsAdmin.id, 1);
      await addPending(deleted.id, 1);

      expect(await loaders.joinRequests(ctx())).toEqual([]);
    });
  });

  describe("unread", () => {
    async function addNotification(read: boolean) {
      await db.insert(schema.notifications).values({
        userId: me,
        type: "broadcast",
        title: "Hello",
        content: "Hello",
        readAt: read ? new Date() : null,
      });
    }

    async function addDmWithMessages({
      fromOthers,
      fromMe,
      lastReadAt,
    }: {
      fromOthers: number;
      fromMe: number;
      lastReadAt: Date | null;
    }) {
      const other = await addUser("dm");
      const [conversation] = await db
        .insert(schema.conversations)
        .values({ type: "dm" })
        .returning();
      conversationIds.push(conversation!.id);
      await db.insert(schema.conversationParticipants).values([
        { conversationId: conversation!.id, userId: me, lastReadAt },
        { conversationId: conversation!.id, userId: other },
      ]);
      for (let i = 0; i < fromOthers; i++) {
        await db.insert(schema.messages).values({
          conversationId: conversation!.id,
          senderId: other,
          content: `hi ${i}`,
        });
      }
      for (let i = 0; i < fromMe; i++) {
        await db.insert(schema.messages).values({
          conversationId: conversation!.id,
          senderId: me,
          content: `reply ${i}`,
        });
      }
    }

    it("is omitted when nothing is unread", async () => {
      await addNotification(true);
      await addDmWithMessages({
        fromOthers: 2,
        fromMe: 0,
        lastReadAt: new Date(Date.now() + 60_000),
      });
      expect(await loaders.unread(ctx())).toEqual([]);
    });

    it("counts unread notifications and inbox messages in one item, like the badges", async () => {
      await addNotification(false);
      await addNotification(false);
      await addNotification(true);
      await addDmWithMessages({ fromOthers: 3, fromMe: 2, lastReadAt: null });

      expect(await loaders.unread(ctx())).toEqual([
        {
          kind: "unread",
          key: "unread",
          urgency: { tier: "catchUp" },
          notifications: 2,
          messages: 3,
        },
      ]);
    });

    it("shows the item when only one side has unread", async () => {
      await addNotification(false);
      expect(await loaders.unread(ctx())).toEqual([
        {
          kind: "unread",
          key: "unread",
          urgency: { tier: "catchUp" },
          notifications: 1,
          messages: 0,
        },
      ]);
    });
  });
});
