// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createPrivateCommunityFixture,
  isLocalDbConfigured,
  type CommunityFixtureRef,
  type PrivateCommunityFixture,
} from "@/test/private-community-fixture";

// Agent calls authenticate with an API key; stub only the key lookup so a
// test can pick the agent's owner. Everything else runs for real.
const agentKey = vi.hoisted(() => ({ ownerId: null as string | null }));
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: vi.fn(async () => ({
    agentId: "agent-private-reads-test",
    ownerId: agentKey.ownerId,
    scopes: ["read"],
    status: agentKey.ownerId ? "active" : "unclaimed",
  })),
}));

const RUN_DB = isLocalDbConfigured();

/**
 * Reads of a members-only community's content and roster (ADR-0050): every
 * outsider gets NOT_FOUND (or nothing), members get it, and a public
 * community behaves as before.
 */
describe.skipIf(!RUN_DB)(
  "private community reads [DB integration]",
  { timeout: 60_000 },
  () => {
    type Mods = {
      db: typeof import("@/server/db").db;
      schema: typeof import("@/server/db/schema");
      createCaller: typeof import("@/server/api/root").createCaller;
      payload: Awaited<
        ReturnType<typeof import("@/server/payload").getPayloadClient>
      >;
      plainTextToLexical: typeof import("@/server/challenge-engine/lexical").plainTextToLexical;
    };
    let m: Mods;
    let f: PrivateCommunityFixture;
    const threadIds: number[] = [];
    const ruleIds: number[] = [];
    const courseIds: number[] = [];
    const threadOf = new Map<string, number>();

    beforeAll(async () => {
      const [
        { db },
        schema,
        { createCaller },
        { getPayloadClient },
        lexical,
        { buildDefaultSpaceRows },
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/payload"),
        import("@/server/challenge-engine/lexical"),
        import("@/server/communities/space-defaults"),
      ]);
      m = {
        db,
        schema,
        createCaller,
        payload: await getPayloadClient(),
        plainTextToLexical: lexical.plainTextToLexical,
      };
      f = await createPrivateCommunityFixture(m);
      for (const c of [f.open, f.inviteOnly, f.approval, f.unlisted]) {
        await db.insert(schema.spaces).values([
          ...buildDefaultSpaceRows(c.id),
          {
            communityId: c.id,
            kind: "room",
            visibility: "public",
            name: "Lounge",
            slug: `lounge-${c.slug}`,
            position: 10,
            createdBy: f.users.owner,
          },
          {
            communityId: c.id,
            kind: "room",
            visibility: "private",
            name: "Back room",
            slug: `back-room-${c.slug}`,
            position: 11,
            createdBy: f.users.owner,
          },
        ]);
        const thread = await m.payload.create({
          collection: "forum-threads",
          data: {
            title: `Gate thread ${c.slug}`,
            slug: `gate-thread-${c.slug}`,
            content: m.plainTextToLexical("body"),
            category: "general",
            authorId: f.users.member,
            authorName: "Member",
            communityId: c.id,
            viewCount: 0,
          },
        });
        threadIds.push(thread.id);
        threadOf.set(c.id, thread.id);
        const rules = await m.payload.create({
          collection: "community-rules",
          data: {
            communityId: c.id,
            version: 1,
            effectiveDate: new Date().toISOString(),
            sections: [
              {
                title: "Be kind",
                slug: "be-kind",
                content: m.plainTextToLexical("Be kind."),
              },
            ],
          },
        });
        ruleIds.push(rules.id);
        const course = await m.payload.create({
          collection: "courses",
          data: {
            title: `Gate course ${c.slug}`,
            slug: `gate-course-${c.slug}`,
            authorId: f.users.owner,
            authorName: "Owner",
            status: "published",
            communityId: c.id,
            isPublic: true,
            enrollmentCount: 0,
          },
        });
        courseIds.push(course.id);
      }
    }, 120_000);

    afterAll(async () => {
      agentKey.ownerId = null;
      if (!m) return;
      await m.payload.delete({
        collection: "forum-threads",
        where: { id: { in: threadIds } },
      });
      await m.payload.delete({
        collection: "community-rules",
        where: { id: { in: ruleIds } },
      });
      await m.payload.delete({
        collection: "courses",
        where: { id: { in: courseIds } },
      });
      const ids = [f.open, f.inviteOnly, f.approval, f.unlisted].map(
        (c) => c.id,
      );
      await m.payload.delete({
        collection: "community-topics",
        where: { communityId: { in: ids } },
      });
      await m.payload.delete({
        collection: "rules-acceptance",
        where: { communityId: { in: ids } },
      });
      await f.cleanup();
    }, 60_000);

    function callerAs(userId: string | null) {
      return m.createCaller({
        db: m.db,
        headers: new Headers({ authorization: "Bearer test-key" }),
        session: userId
          ? ({ user: { id: userId, name: "Tester" }, session: {} } as never)
          : null,
      });
    }

    /** An agent call, reading as `ownerId` (null: an unclaimed agent). */
    function agentOf(ownerId: string | null) {
      agentKey.ownerId = ownerId;
      return callerAs(null);
    }

    /** One block per members-only community; `c()` reads the fixture lazily. */
    const each = (fn: (c: () => CommunityFixtureRef) => void) =>
      describe.each([
        ["listed invite_only", "inviteOnly"],
        ["listed approval_required", "approval"],
        ["unlisted", "unlisted"],
      ] as const)("%s", (_label, key) => fn(() => f[key]));

    describe("agent.browseMembers", () => {
      it("refuses a members-only roster to an agent whose owner is not a member", async () => {
        for (const [, c] of f.membersOnly) {
          for (const owner of f.outsiders) {
            await expect(
              agentOf(owner).agent.browseMembers({ communitySlug: c.slug }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
          }
        }
      });

      it("lists a members-only roster for an agent whose owner is a member", async () => {
        const members = await agentOf(f.users.member).agent.browseMembers({
          communitySlug: f.inviteOnly.slug,
        });
        expect(members.map((r) => r.userId).sort()).toEqual(
          [f.users.owner, f.users.member, f.users.privateMember].sort(),
        );
      });

      it("lists a public community's roster to an unclaimed agent", async () => {
        const members = await agentOf(null).agent.browseMembers({
          communitySlug: f.open.slug,
        });
        expect(members.map((r) => r.userId)).toContain(f.users.member);
      });

      it("keeps a private profile's details out, as communities.getMembers does", async () => {
        const members = await agentOf(null).agent.browseMembers({
          communitySlug: f.open.slug,
        });
        const hidden = members.find((r) => r.userId === f.users.privateMember);
        expect(hidden).toMatchObject({ xp: null, level: null, company: null });
        const shown = members.find((r) => r.userId === f.users.member);
        expect(shown).toMatchObject({ xp: 120 });
      });
    });

    describe("agent.getCommunityInfo", () => {
      it("gives an outsider's agent only the front door of a members-only community", async () => {
        for (const [, c] of f.membersOnly) {
          for (const owner of [f.users.outsider, f.users.pending]) {
            const info = await agentOf(owner).agent.getCommunityInfo({
              slug: c.slug,
            });
            expect(info).toMatchObject({
              slug: c.slug,
              viewerCanReadContent: false,
              memberCount: null,
              spaces: [],
              magazine: null,
            });
            expect(info).not.toHaveProperty("createdBy");
          }
        }
      });

      it("gives a member's agent the inside, but never createdBy or a room they are not in", async () => {
        const info = await agentOf(f.users.member).agent.getCommunityInfo({
          slug: f.inviteOnly.slug,
        });
        expect(info.viewerCanReadContent).toBe(true);
        expect(info.memberCount).toBe(3);
        expect(info).not.toHaveProperty("createdBy");
        const slugs = info.spaces.map((s) => s.slug);
        expect(slugs).toContain(`lounge-${f.inviteOnly.slug}`);
        expect(slugs).not.toContain(`back-room-${f.inviteOnly.slug}`);
      });

      it("gives the owner's agent every room", async () => {
        const info = await agentOf(f.users.owner).agent.getCommunityInfo({
          slug: f.inviteOnly.slug,
        });
        expect(info.spaces.map((s) => s.slug)).toContain(
          `back-room-${f.inviteOnly.slug}`,
        );
      });
    });

    describe("spaces", () => {
      it("hides a members-only community's spaces and rooms from outsiders", async () => {
        for (const [, c] of f.membersOnly) {
          for (const viewer of f.outsiders) {
            await expect(
              callerAs(viewer).spaces.list({ slug: c.slug }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
            if (viewer === null) continue; // rooms need a session anyway
            await expect(
              callerAs(viewer).spaces.listRooms({ slug: c.slug }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
            await expect(
              callerAs(viewer).spaces.getRoom({
                slug: c.slug,
                spaceSlug: `lounge-${c.slug}`,
              }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
          }
        }
      });

      it("shows a members-only community's spaces and rooms to members", async () => {
        const caller = callerAs(f.users.member);
        const tabs = await caller.spaces.list({ slug: f.approval.slug });
        expect(tabs.length).toBeGreaterThan(0);
        const rooms = await caller.spaces.listRooms({ slug: f.approval.slug });
        expect(rooms.map((r) => r.name)).toEqual(["Lounge", "Back room"]);
        await expect(
          caller.spaces.getRoom({
            slug: f.approval.slug,
            spaceSlug: `lounge-${f.approval.slug}`,
          }),
        ).resolves.toMatchObject({ name: "Lounge" });
      });

      it("keeps a public community's spaces public", async () => {
        await expect(
          callerAs(null).spaces.list({ slug: f.open.slug }),
        ).resolves.not.toHaveLength(0);
        await expect(
          callerAs(f.users.outsider).spaces.listRooms({ slug: f.open.slug }),
        ).resolves.toHaveLength(2);
      });
    });

    describe("communities.getMembers statuses", () => {
      it("lists pending and banned members only to community managers", async () => {
        for (const status of ["pending_approval", "banned"] as const) {
          await expect(
            callerAs(f.users.member).communities.getMembers({
              slug: f.inviteOnly.slug,
              status,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            callerAs(null).communities.getMembers({
              slug: f.open.slug,
              status,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
        const pending = await callerAs(f.users.owner).communities.getMembers({
          slug: f.inviteOnly.slug,
          status: "pending_approval",
        });
        expect(pending.items.map((r) => r.userId)).toEqual([f.users.pending]);
      });

      it("still lists active members to anyone who may read the roster", async () => {
        await expect(
          callerAs(null).communities.getMembers({ slug: f.open.slug }),
        ).resolves.toMatchObject({ items: expect.any(Array) });
      });
    });

    describe("forum.incrementViewCount", () => {
      it("refuses a members-only thread to outsiders and leaves its count alone", async () => {
        for (const [, c] of f.membersOnly) {
          const threadId = threadOf.get(c.id)!;
          for (const viewer of f.outsiders) {
            await expect(
              callerAs(viewer).forum.incrementViewCount({ threadId }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
          }
          const thread = await m.payload.findByID({
            collection: "forum-threads",
            id: threadId,
            depth: 0,
          });
          expect(thread.viewCount ?? 0).toBe(0);
        }
      });

      it("counts a member's view, and a guest's on a public thread", async () => {
        await expect(
          callerAs(f.users.member).forum.incrementViewCount({
            threadId: threadOf.get(f.unlisted.id)!,
          }),
        ).resolves.toEqual({ ok: true });
        await expect(
          callerAs(null).forum.incrementViewCount({
            threadId: threadOf.get(f.open.id)!,
          }),
        ).resolves.toEqual({ ok: true });
      });

      it("answers NOT_FOUND for a missing thread", async () => {
        await expect(
          callerAs(null).forum.incrementViewCount({ threadId: 2_000_000_000 }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      });
    });

    describe("agent.browseClassrooms", () => {
      it("refuses a members-only classroom to an agent whose owner is not a member", async () => {
        for (const [, c] of f.membersOnly) {
          for (const owner of f.outsiders) {
            await expect(
              agentOf(owner).agent.browseClassrooms({ communitySlug: c.slug }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
          }
        }
      });

      it("shows a members-only classroom through a member owner, and a public one to anyone", async () => {
        const member = await agentOf(f.users.member).agent.browseClassrooms({
          communitySlug: f.approval.slug,
        });
        expect(member.courses.map((c) => c.slug)).toEqual([
          `gate-course-${f.approval.slug}`,
        ]);
        const guest = await agentOf(null).agent.browseClassrooms({
          communitySlug: f.open.slug,
        });
        expect(guest.courses.map((c) => c.slug)).toEqual([
          `gate-course-${f.open.slug}`,
        ]);
      });
    });

    describe("rules and topics", () => {
      each((c) => {
        it("hides rules and topics from strangers", async () => {
          for (const viewer of [null, f.users.outsider]) {
            await expect(
              callerAs(viewer).forum.getRules({ communitySlug: c().slug }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
            await expect(
              callerAs(viewer).topics.list({ communitySlug: c().slug }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
          }
          await expect(
            callerAs(f.users.outsider).forum.acceptRules({
              communitySlug: c().slug,
            }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
        });

        it("shows rules to people on the way in, but not topics", async () => {
          for (const viewer of [f.users.pending, f.users.invited]) {
            await expect(
              callerAs(viewer).forum.getRules({ communitySlug: c().slug }),
            ).resolves.toMatchObject({ hasAccepted: false });
            await expect(
              callerAs(viewer).topics.list({ communitySlug: c().slug }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
          }
          await expect(
            callerAs(f.users.invited).forum.acceptRules({
              communitySlug: c().slug,
            }),
          ).resolves.toEqual({ alreadyAccepted: false });
        });

        it("shows rules and topics to members", async () => {
          await expect(
            callerAs(f.users.member).forum.getRules({
              communitySlug: c().slug,
            }),
          ).resolves.toMatchObject({ rules: expect.anything() });
          const topics = await callerAs(f.users.member).topics.list({
            communitySlug: c().slug,
          });
          expect(topics.map((t) => t.slug)).toContain("general");
        });
      });

      it("does not create a public community's default topic for an outsider", async () => {
        const { docs: before } = await m.payload.find({
          collection: "community-topics",
          where: { communityId: { equals: f.open.id } },
          depth: 0,
        });
        expect(before).toHaveLength(0);
        await expect(
          callerAs(null).topics.list({ communitySlug: f.open.slug }),
        ).resolves.toEqual([]);
        await expect(
          callerAs(f.users.outsider).forum.getRules({
            communitySlug: f.open.slug,
          }),
        ).resolves.toMatchObject({ rules: expect.anything() });
        const { docs: after } = await m.payload.find({
          collection: "community-topics",
          where: { communityId: { equals: f.open.id } },
          depth: 0,
        });
        expect(after).toHaveLength(0);
      });
    });
  },
);
