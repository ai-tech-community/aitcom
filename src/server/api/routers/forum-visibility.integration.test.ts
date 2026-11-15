// @vitest-environment node
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Agent calls authenticate with an API key; stub only the key lookup so a
// test can pick the agent's owner. Everything else runs for real.
const agentKey = vi.hoisted(() => ({ ownerId: null as string | null }));
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: vi.fn(async () => ({
    agentId: "agent-visibility-test",
    ownerId: agentKey.ownerId,
    scopes: ["read"],
    status: agentKey.ownerId ? "active" : "unclaimed",
  })),
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

describe.skipIf(!RUN_DB)(
  "unlisted community visibility [DB integration]",
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

    let sfx: string;
    let memberId: string;
    let outsiderId: string;
    let unlisted: { id: string; slug: string };
    let listed: { id: string; slug: string };
    let unlistedThread: { id: number; slug: string };
    let listedThread: { id: number; slug: string };
    let hubThread: { id: number; slug: string };
    let unlistedIdeaId: number;

    beforeAll(async () => {
      const [{ db }, schema, { createCaller }, { getPayloadClient }, lexical] =
        await Promise.all([
          import("@/server/db"),
          import("@/server/db/schema"),
          import("@/server/api/root"),
          import("@/server/payload"),
          import("@/server/challenge-engine/lexical"),
        ]);
      m = {
        db,
        schema,
        createCaller,
        payload: await getPayloadClient(),
        plainTextToLexical: lexical.plainTextToLexical,
      };
    }, 120_000);

    async function createThread(title: string, communityId: string | null) {
      const doc = await m.payload.create({
        collection: "forum-threads",
        data: {
          title,
          slug: `${title}-${sfx}`,
          content: m.plainTextToLexical(`${title} body`),
          category: "general",
          authorId: memberId,
          authorName: "Member",
          ...(communityId ? { communityId } : {}),
        },
      });
      await m.payload.create({
        collection: "forum-replies",
        data: {
          thread: doc.id,
          content: m.plainTextToLexical(`${title} reply`),
          authorId: memberId,
          ...(communityId ? { communityId } : {}),
        },
      });
      return { id: doc.id, slug: doc.slug };
    }

    beforeEach(async () => {
      const { db, schema } = m;
      sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      memberId = `vis-member-${sfx}`;
      outsiderId = `vis-outsider-${sfx}`;
      await db.insert(schema.user).values([
        { id: memberId, email: `${memberId}@example.test`, name: "Member" },
        {
          id: outsiderId,
          email: `${outsiderId}@example.test`,
          name: "Outsider",
        },
      ]);
      const [u, l] = await db
        .insert(schema.communities)
        .values([
          {
            name: `Unlisted ${sfx}`,
            slug: `unlisted-${sfx}`,
            createdBy: memberId,
            isListedInDirectory: false,
          },
          {
            name: `Listed ${sfx}`,
            slug: `listed-${sfx}`,
            createdBy: memberId,
            isListedInDirectory: true,
          },
        ])
        .returning();
      unlisted = { id: u!.id, slug: u!.slug };
      listed = { id: l!.id, slug: l!.slug };
      await db.insert(schema.communityMemberships).values([
        { communityId: unlisted.id, userId: memberId, status: "active" },
        { communityId: listed.id, userId: memberId, status: "active" },
      ]);
      unlistedThread = await createThread("secret-plans", unlisted.id);
      listedThread = await createThread("open-plans", listed.id);
      // Legacy Hub thread: no communityId at all.
      hubThread = await createThread("hub-plans", null);
      const idea = await m.payload.create({
        collection: "community-ideas",
        data: {
          title: `secret idea ${sfx}`,
          authorId: memberId,
          status: "open",
          category: "platform",
          communityId: unlisted.id,
        },
      });
      unlistedIdeaId = idea.id;
    });

    afterEach(async () => {
      const { db, schema } = m;
      const { eq, inArray } = await import("drizzle-orm");
      await m.payload.delete({
        collection: "community-ideas",
        id: unlistedIdeaId,
      });
      const threadIds = [unlistedThread.id, listedThread.id, hubThread.id];
      await m.payload.delete({
        collection: "forum-replies",
        where: { thread: { in: threadIds } },
      });
      await m.payload.delete({
        collection: "forum-threads",
        where: { id: { in: threadIds } },
      });
      const communityIds = [unlisted.id, listed.id];
      await db
        .delete(schema.communityMemberships)
        .where(inArray(schema.communityMemberships.communityId, communityIds));
      await db
        .delete(schema.communities)
        .where(inArray(schema.communities.id, communityIds));
      for (const id of [memberId, outsiderId]) {
        await db.delete(schema.user).where(eq(schema.user.id, id));
      }
    });

    afterAll(() => {
      agentKey.ownerId = null;
    });

    function callerAs(userId: string | null) {
      return m.createCaller({
        db: m.db,
        headers: new Headers({ authorization: "Bearer test-key" }),
        session: userId
          ? ({ user: { id: userId }, session: {} } as never)
          : null,
      });
    }

    function slugsOf(threads: { slug?: string | null }[]): (string | null)[] {
      return threads.map((t) => t.slug ?? null);
    }

    describe("forum.getThreads", () => {
      it("hides an unlisted community's forum from guests and outsiders", async () => {
        for (const viewer of [null, outsiderId]) {
          await expect(
            callerAs(viewer).forum.getThreads({ communitySlug: unlisted.slug }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
        }
      });

      it("shows an unlisted community's forum to its members", async () => {
        const res = await callerAs(memberId).forum.getThreads({
          communitySlug: unlisted.slug,
        });
        expect(slugsOf(res.threads)).toEqual([unlistedThread.slug]);
      });

      it("shows a listed community's forum to guests", async () => {
        const res = await callerAs(null).forum.getThreads({
          communitySlug: listed.slug,
        });
        expect(slugsOf(res.threads)).toEqual([listedThread.slug]);
      });

      it("answers NOT_FOUND for an unknown slug instead of listing everything", async () => {
        await expect(
          callerAs(null).forum.getThreads({ communitySlug: `nope-${sfx}` }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("drops unlisted threads from the unscoped listing for outsiders only", async () => {
        const outsider = await callerAs(outsiderId).forum.getThreads({
          limit: 50,
          search: "plans",
        });
        expect(slugsOf(outsider.threads)).toEqual(
          expect.arrayContaining([listedThread.slug, hubThread.slug]),
        );
        expect(slugsOf(outsider.threads)).not.toContain(unlistedThread.slug);

        const member = await callerAs(memberId).forum.getThreads({
          limit: 50,
          search: "plans",
        });
        expect(slugsOf(member.threads)).toEqual(
          expect.arrayContaining([listedThread.slug, unlistedThread.slug]),
        );
      });
    });

    describe("forum.getIdeas", () => {
      it("returns an empty list for an unlisted community's outsiders", async () => {
        for (const viewer of [null, outsiderId]) {
          await expect(
            callerAs(viewer).forum.getIdeas({ communitySlug: unlisted.slug }),
          ).resolves.toEqual([]);
        }
      });

      it("returns an unlisted community's ideas to its members", async () => {
        const ideas = await callerAs(memberId).forum.getIdeas({
          communitySlug: unlisted.slug,
        });
        expect(ideas.map((i) => i.id)).toEqual([unlistedIdeaId]);
      });
    });

    describe("forum.getThread and forum.getReplies", () => {
      it("refuse an unlisted thread to guests and outsiders", async () => {
        for (const viewer of [null, outsiderId]) {
          const caller = callerAs(viewer);
          await expect(
            caller.forum.getThread({ slug: unlistedThread.slug }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
          await expect(
            caller.forum.getReplies({ threadId: unlistedThread.id }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
        }
      });

      it("serve an unlisted thread to its members", async () => {
        const caller = callerAs(memberId);
        const thread = await caller.forum.getThread({
          slug: unlistedThread.slug,
        });
        expect(thread.id).toBe(unlistedThread.id);
        const replies = await caller.forum.getReplies({
          threadId: unlistedThread.id,
        });
        expect(replies).toHaveLength(1);
      });

      it("serve a listed thread to guests", async () => {
        const caller = callerAs(null);
        await expect(
          caller.forum.getThread({ slug: listedThread.slug }),
        ).resolves.toMatchObject({ id: listedThread.id });
        await expect(
          caller.forum.getReplies({ threadId: listedThread.id }),
        ).resolves.toHaveLength(1);
      });

      it("answer NOT_FOUND for a missing thread id", async () => {
        await expect(
          callerAs(null).forum.getReplies({ threadId: 2_000_000_000 }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      });
    });

    describe("agent read tools", () => {
      it("give an unclaimed agent public content only", async () => {
        agentKey.ownerId = null;
        const caller = callerAs(null);
        await expect(
          caller.agent.browseThreads({ communitySlug: unlisted.slug }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(
          caller.agent.readThread({ threadId: unlistedThread.id }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        const ids = (await caller.agent.browseThreads({ limit: 50 })).map(
          (t) => t.id,
        );
        expect(ids).toContain(listedThread.id);
        expect(ids).not.toContain(unlistedThread.id);
      });

      it("let an agent read what its member owner can read", async () => {
        agentKey.ownerId = memberId;
        const caller = callerAs(null);
        const threads = await caller.agent.browseThreads({
          communitySlug: unlisted.slug,
        });
        expect(threads.map((t) => t.id)).toEqual([unlistedThread.id]);
        const read = await caller.agent.readThread({
          threadId: unlistedThread.id,
        });
        expect(read.replies).toHaveLength(1);
      });
    });

    describe("listed private communities (ADR-0050)", () => {
      type Policy = "invite_only" | "approval_required";
      let closed: Record<Policy, { id: string; slug: string }>;
      let closedThreads: { id: number; slug: string }[];
      let pendingId: string;
      let invitedId: string;

      beforeEach(async () => {
        const { db, schema } = m;
        pendingId = `vis-pending-${sfx}`;
        invitedId = `vis-invited-${sfx}`;
        await db.insert(schema.user).values([
          { id: pendingId, email: `${pendingId}@example.test`, name: "P" },
          { id: invitedId, email: `${invitedId}@example.test`, name: "I" },
        ]);
        const rows = await db
          .insert(schema.communities)
          .values(
            (["invite_only", "approval_required"] as const).map((policy) => ({
              name: `Closed ${policy} ${sfx}`,
              slug: `closed-${policy.replace("_", "-")}-${sfx}`,
              createdBy: memberId,
              isListedInDirectory: true,
              joinPolicy: policy,
            })),
          )
          .returning();
        closed = {
          invite_only: { id: rows[0]!.id, slug: rows[0]!.slug },
          approval_required: { id: rows[1]!.id, slug: rows[1]!.slug },
        };
        const ids = [closed.invite_only.id, closed.approval_required.id];
        await db.insert(schema.communityMemberships).values(
          ids.flatMap((communityId) => [
            { communityId, userId: memberId, status: "active" as const },
            {
              communityId,
              userId: pendingId,
              status: "pending_approval" as const,
            },
            { communityId, userId: invitedId, status: "invited" as const },
          ]),
        );
        closedThreads = [
          await createThread("closed-invite-plans", closed.invite_only.id),
          await createThread(
            "closed-approval-plans",
            closed.approval_required.id,
          ),
        ];
      });

      afterEach(async () => {
        const { db, schema } = m;
        const { eq, inArray } = await import("drizzle-orm");
        const threadIds = closedThreads.map((t) => t.id);
        await m.payload.delete({
          collection: "forum-replies",
          where: { thread: { in: threadIds } },
        });
        await m.payload.delete({
          collection: "forum-threads",
          where: { id: { in: threadIds } },
        });
        const ids = [closed.invite_only.id, closed.approval_required.id];
        await db
          .delete(schema.communityMemberships)
          .where(inArray(schema.communityMemberships.communityId, ids));
        await db
          .delete(schema.communities)
          .where(inArray(schema.communities.id, ids));
        for (const id of [pendingId, invitedId]) {
          await db.delete(schema.user).where(eq(schema.user.id, id));
        }
      });

      const policies: Policy[] = ["invite_only", "approval_required"];

      it.each(policies)(
        "hide a listed %s community's forum and roster from every outsider",
        async (policy) => {
          for (const viewer of [null, outsiderId, pendingId, invitedId]) {
            const caller = callerAs(viewer);
            await expect(
              caller.forum.getThreads({ communitySlug: closed[policy].slug }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
            await expect(
              caller.communities.getMembers({ slug: closed[policy].slug }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
            await expect(
              caller.communities.getMemberStack({ slug: closed[policy].slug }),
            ).resolves.toEqual({ faces: [], total: 0 });
            const profile = await caller.communities.getBySlug({
              slug: closed[policy].slug,
            });
            expect(profile).toMatchObject({
              joinPolicy: policy,
              viewerCanReadContent: false,
              memberCount: null,
              liveness: { activeContributors: 0, recentThreads: 0 },
            });
            expect(profile).not.toHaveProperty("createdBy");
          }
        },
        30_000,
      );

      it("drop listed private threads from the unscoped listing for outsiders", async () => {
        const outsider = await callerAs(outsiderId).forum.getThreads({
          limit: 50,
          search: "plans",
        });
        for (const thread of closedThreads) {
          expect(slugsOf(outsider.threads)).not.toContain(thread.slug);
        }
        const member = await callerAs(memberId).forum.getThreads({
          limit: 50,
          search: "plans",
        });
        expect(slugsOf(member.threads)).toEqual(
          expect.arrayContaining(closedThreads.map((t) => t.slug)),
        );
      }, 30_000);

      it("show outsiders a listed private card without count or activity, and members in full", async () => {
        const { invalidateDirectorySnapshots } =
          await import("@/server/communities/directory-queries");
        const cardOf = async (viewer: string | null, slug: string) => {
          invalidateDirectorySnapshots();
          const page = await callerAs(viewer).communities.directory({
            q: sfx,
            limit: 48,
            locale: "en",
          });
          return page.items.find((item) => item.slug === slug);
        };
        for (const policy of policies) {
          for (const viewer of [null, outsiderId, pendingId, invitedId]) {
            expect(await cardOf(viewer, closed[policy].slug)).toMatchObject({
              memberCount: null,
              activeRecently: null,
              openRooms: null,
              faces: [],
            });
          }
          const member = await cardOf(memberId, closed[policy].slug);
          expect(member?.memberCount).toBe(1);
          expect(member?.activeRecently).toEqual(expect.any(Number));
        }
        expect((await cardOf(null, listed.slug))?.memberCount).toBe(1);
      }, 60_000);

      it("give an agent a private community's member count only through a member owner", async () => {
        const countsFor = async () => {
          const items = await callerAs(null).agent.browseCommunities({
            search: sfx,
            limit: 50,
          });
          return new Map(items.map((item) => [item.slug, item.memberCount]));
        };
        agentKey.ownerId = null;
        const unclaimed = await countsFor();
        expect(unclaimed.get(closed.invite_only.slug)).toBeNull();
        expect(unclaimed.get(closed.approval_required.slug)).toBeNull();
        expect(unclaimed.get(listed.slug)).toBe(1);
        agentKey.ownerId = outsiderId;
        expect((await countsFor()).get(closed.invite_only.slug)).toBeNull();
        agentKey.ownerId = memberId;
        expect((await countsFor()).get(closed.invite_only.slug)).toBe(1);
        agentKey.ownerId = null;
      }, 60_000);

      it.each(policies)(
        "serve a listed %s community to its active members",
        async (policy) => {
          const caller = callerAs(memberId);
          const res = await caller.forum.getThreads({
            communitySlug: closed[policy].slug,
          });
          expect(res.threads).toHaveLength(1);
          await expect(
            caller.communities.getMembers({ slug: closed[policy].slug }),
          ).resolves.toBeTruthy();
          await expect(
            caller.communities.getBySlug({ slug: closed[policy].slug }),
          ).resolves.toMatchObject({ viewerCanReadContent: true });
        },
        30_000,
      );
    });

    describe("communities roster (shared rule)", () => {
      it("keeps an unlisted member list members-only", async () => {
        await expect(
          callerAs(outsiderId).communities.getMembers({ slug: unlisted.slug }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        const res = await callerAs(memberId).communities.getMembers({
          slug: unlisted.slug,
        });
        expect(res).toBeTruthy();
        await expect(
          callerAs(null).communities.getMemberStack({ slug: unlisted.slug }),
        ).resolves.toEqual({ faces: [], total: 0 });
      });
    });
  },
);
