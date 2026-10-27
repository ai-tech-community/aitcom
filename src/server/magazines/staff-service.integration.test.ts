// @vitest-environment node
import { and, eq, inArray } from "drizzle-orm";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { MagazineRole } from "@/lib/magazines/roles";
import type { Magazine } from "@/payload-types";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { Deps } from "./deps";
import type * as Staff from "./staff-service";

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

describe.skipIf(!RUN_DB)(
  "magazine team [DB integration]",
  { timeout: 30_000 },
  () => {
    let m: {
      db: typeof Db;
      schema: typeof Schema;
      payload: Deps["payload"];
      staff: typeof Staff;
    };
    let fx: {
      users: {
        owner: string;
        admin: string;
        moderator: string;
        member: string;
        second: string;
        banned: string;
        outsider: string;
      };
      community: { id: string; slug: string };
      magazine: Magazine;
    };

    beforeAll(async () => {
      const [{ db }, schema, staff, { getPayloadClient }] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("./staff-service"),
        import("@/server/payload"),
      ]);
      m = { db, schema, staff, payload: await getPayloadClient() };
    }, 120_000);

    beforeEach(async () => {
      const { db, schema, payload } = m;
      const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const users = {
        owner: `ms-owner-${sfx}`,
        admin: `ms-admin-${sfx}`,
        moderator: `ms-mod-${sfx}`,
        member: `ms-member-${sfx}`,
        second: `ms-second-${sfx}`,
        banned: `ms-banned-${sfx}`,
        outsider: `ms-outside-${sfx}`,
      };
      await db.insert(schema.user).values(
        Object.values(users).map((id) => ({
          id,
          email: `${id}@example.test`,
          name: id,
        })),
      );
      await db.insert(schema.memberProfiles).values(
        Object.values(users).map((userId) => ({
          userId,
          displayName: userId,
        })),
      );
      const [community] = await db
        .insert(schema.communities)
        .values({
          name: `Staff ${sfx}`,
          slug: `ms-${sfx}`,
          createdBy: users.owner,
        })
        .returning();
      await db.insert(schema.communityMemberships).values([
        { communityId: community!.id, userId: users.owner, role: "owner" },
        { communityId: community!.id, userId: users.admin, role: "admin" },
        {
          communityId: community!.id,
          userId: users.moderator,
          role: "moderator",
        },
        { communityId: community!.id, userId: users.member, role: "member" },
        { communityId: community!.id, userId: users.second, role: "member" },
        {
          communityId: community!.id,
          userId: users.banned,
          role: "member",
          status: "banned",
        },
      ]);
      const magazine = await payload.create({
        collection: "magazines",
        data: {
          name: "The Gazette",
          slug: `ms-gazette-${sfx}`,
          communityId: community!.id,
          createdBy: users.owner,
        },
      });
      fx = {
        users,
        community: { id: community!.id, slug: community!.slug },
        magazine,
      };
    }, 60_000);

    afterEach(async () => {
      vi.restoreAllMocks();
      if (!fx) return;
      const { db, schema, payload } = m;
      const ids = Object.values(fx.users);
      await db
        .delete(schema.magazineStaff)
        .where(inArray(schema.magazineStaff.userId, ids));
      await db
        .delete(schema.notifications)
        .where(inArray(schema.notifications.userId, ids));
      await payload.delete({ collection: "magazines", id: fx.magazine.id });
      await db
        .delete(schema.spaces)
        .where(eq(schema.spaces.communityId, fx.community.id));
      await db
        .delete(schema.communityMemberships)
        .where(inArray(schema.communityMemberships.userId, ids));
      await db
        .delete(schema.communities)
        .where(eq(schema.communities.id, fx.community.id));
      await db
        .delete(schema.pointsEvents)
        .where(inArray(schema.pointsEvents.userId, ids));
      await db
        .delete(schema.activityEvents)
        .where(inArray(schema.activityEvents.actorId, ids));
      await db
        .delete(schema.memberBadges)
        .where(inArray(schema.memberBadges.userId, ids));
      await db
        .delete(schema.memberProfiles)
        .where(inArray(schema.memberProfiles.userId, ids));
      await db.delete(schema.user).where(inArray(schema.user.id, ids));
    }, 60_000);

    const assign = (
      userId = fx.users.member,
      role: MagazineRole = "contributor",
      database = m.db,
    ) =>
      m.staff.assignMagazineRole(
        database,
        fx.magazine,
        { userId, role },
        { userId: fx.users.owner, community: fx.community },
      );
    const list = () => m.staff.listMagazineStaff(m.db, fx.magazine);
    const stored = () =>
      m.db
        .select()
        .from(m.schema.magazineStaff)
        .where(eq(m.schema.magazineStaff.magazineId, fx.magazine.id));
    const notices = () =>
      m.db
        .select()
        .from(m.schema.notifications)
        .where(
          and(
            eq(m.schema.notifications.userId, fx.users.member),
            eq(m.schema.notifications.type, "magazine_role_assigned"),
          ),
        );
    const membership = (userId: string) =>
      and(
        eq(m.schema.communityMemberships.communityId, fx.community.id),
        eq(m.schema.communityMemberships.userId, userId),
      );
    const displayName = (userId: string, name: string) =>
      m.db
        .update(m.schema.memberProfiles)
        .set({ displayName: name })
        .where(eq(m.schema.memberProfiles.userId, userId));

    it("lists owners and admins as editors-in-chief, then the team", async () => {
      await assign(fx.users.member, "contributor");
      await assign(fx.users.second, "editor");
      await assign(fx.users.moderator, "editor");
      await displayName(fx.users.second, "Zoe");
      await displayName(fx.users.moderator, "Amy");
      expect(
        (await list()).map(({ userId, role, source, isActiveMember }) => ({
          userId,
          role,
          source,
          isActiveMember,
        })),
      ).toEqual([
        {
          userId: fx.users.owner,
          role: "editor_in_chief",
          source: "owner",
          isActiveMember: true,
        },
        {
          userId: fx.users.admin,
          role: "editor_in_chief",
          source: "admin",
          isActiveMember: true,
        },
        {
          userId: fx.users.moderator,
          role: "editor",
          source: "assigned",
          isActiveMember: true,
        },
        {
          userId: fx.users.second,
          role: "editor",
          source: "assigned",
          isActiveMember: true,
        },
        {
          userId: fx.users.member,
          role: "contributor",
          source: "assigned",
          isActiveMember: true,
        },
      ]);
    });

    it("assigns a member, changes the role, and tells them each time", async () => {
      expect(await assign()).toMatchObject({
        userId: fx.users.member,
        role: "contributor",
        source: "assigned",
        isActiveMember: true,
      });
      expect(await assign(fx.users.member, "editor")).toMatchObject({
        role: "editor",
      });
      expect(await stored()).toEqual([
        expect.objectContaining({
          userId: fx.users.member,
          role: "editor",
          assignedBy: fx.users.owner,
        }),
      ]);
      const rows = await notices();
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.metadata.reviewPath)).toEqual([
        `/communities/${fx.community.slug}/magazine`,
        `/communities/${fx.community.slug}/magazine`,
      ]);
      expect(rows.map((row) => row.metadata.magazineRole).sort()).toEqual([
        "contributor",
        "editor",
      ]);
    });

    it("refuses owners, admins and non-members", async () => {
      for (const id of [fx.users.owner, fx.users.admin])
        await expect(assign(id)).rejects.toMatchObject({
          message: "STAFF_LEADS_COMMUNITY",
          code: "BAD_REQUEST",
        });
      for (const id of [fx.users.outsider, fx.users.banned])
        await expect(assign(id)).rejects.toMatchObject({
          message: "STAFF_NOT_MEMBER",
          code: "BAD_REQUEST",
        });
      expect(await stored()).toEqual([]);
    });

    it("assigning the same role again sends no second notice", async () => {
      const first = await assign();
      const before = await stored();
      expect(await assign()).toEqual(first);
      expect(await stored()).toEqual(before);
      expect(await notices()).toHaveLength(1);
    });

    it("search finds active members not yet on the team", async () => {
      await assign(fx.users.second);
      for (const id of [
        fx.users.member,
        fx.users.owner,
        fx.users.admin,
        fx.users.second,
        fx.users.banned,
        fx.users.outsider,
      ])
        await displayName(id, "Flower 100% Club");
      const search = (query: string) =>
        m.staff.searchStaffCandidates(m.db, fx.magazine, query);
      expect(await search("flower")).toEqual([
        { userId: fx.users.member, name: "Flower 100% Club", image: null },
      ]);
      expect(await search("%")).toEqual([
        { userId: fx.users.member, name: "Flower 100% Club", image: null },
      ]);
      expect(await search(fx.users.member)).toEqual([
        { userId: fx.users.member, name: "Flower 100% Club", image: null },
      ]);
      await displayName(fx.users.member, "Flower Club");
      expect(await search("%")).toEqual([]);
      await m.db
        .delete(m.schema.memberProfiles)
        .where(eq(m.schema.memberProfiles.userId, fx.users.member));
      expect(await search(fx.users.member)).toEqual([
        { userId: fx.users.member, name: fx.users.member, image: null },
      ]);
    });

    it("lists a team member who left as not a member now", async () => {
      await assign();
      await m.db
        .update(m.schema.communityMemberships)
        .set({ status: "banned" })
        .where(membership(fx.users.member));
      expect(await list()).toContainEqual(
        expect.objectContaining({
          userId: fx.users.member,
          role: "contributor",
          source: "assigned",
          isActiveMember: false,
        }),
      );
      await m.db
        .delete(m.schema.communityMemberships)
        .where(membership(fx.users.member));
      expect(await list()).toContainEqual(
        expect.objectContaining({
          userId: fx.users.member,
          isActiveMember: false,
        }),
      );
    });

    it("lists someone made admin after joining the team once, as admin", async () => {
      await assign();
      await m.db
        .update(m.schema.communityMemberships)
        .set({ role: "admin" })
        .where(membership(fx.users.member));
      expect(
        (await list()).filter((row) => row.userId === fx.users.member),
      ).toEqual([
        expect.objectContaining({
          role: "editor_in_chief",
          source: "admin",
          isActiveMember: true,
        }),
      ]);
      expect(await stored()).toEqual([
        expect.objectContaining({ role: "contributor" }),
      ]);
    });

    it("a notification failure never fails the assignment", async () => {
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const database = new Proxy(m.db, {
        get(target, property, receiver) {
          if (property === "insert")
            return (table: unknown) => {
              if (table === m.schema.notifications)
                throw new Error("Inbox unavailable");
              return target.insert(table as typeof m.schema.magazineStaff);
            };
          return Reflect.get(target, property, receiver) as unknown;
        },
      });
      expect(
        await assign(fx.users.member, "contributor", database),
      ).toMatchObject({ role: "contributor" });
      expect(await stored()).toHaveLength(1);
      expect(await notices()).toHaveLength(0);
      expect(log).toHaveBeenCalledWith(
        "[magazines] notification failed",
        expect.any(Error),
      );
    });

    it("removes an assignment idempotently", async () => {
      await assign();
      await m.staff.removeMagazineRole(m.db, fx.magazine, fx.users.member);
      await m.staff.removeMagazineRole(m.db, fx.magazine, fx.users.member);
      expect(await stored()).toEqual([]);
      expect((await list()).map((row) => row.userId)).toEqual([
        fx.users.owner,
        fx.users.admin,
      ]);
    });
  },
);
