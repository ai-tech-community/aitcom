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
