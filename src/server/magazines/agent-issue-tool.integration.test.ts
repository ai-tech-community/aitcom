// @vitest-environment node
/**
 * save-magazine-issue through the agent procedure, against Payload.
 * A draft article must be refused and must not leave an issue behind.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const state = vi.hoisted(() => ({
  agentId: "agent-nova",
  ownerId: "",
}));

vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: async () =>
    state.ownerId
      ? {
          agentId: state.agentId,
          ownerId: state.ownerId,
          scopes: ["read", "contribute"],
        }
      : null,
}));

function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (/neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    url,
  );
}

describe.skipIf(!isLocalDbConfigured())(
  "save-magazine-issue tool path [DB integration]",
  () => {
    let db: typeof import("@/server/db").db;
    let schema: typeof import("@/server/db/schema");
    let payload: Awaited<
      ReturnType<typeof import("@/server/payload").getPayloadClient>
    >;
    let save: (input: {
      magazineSlug: string;
      title: string;
      articleIds?: number[];
      items?: { kind: "article"; articleId: number }[];
    }) => Promise<unknown>;

    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const userId = `issue-tool-${sfx}`;
    let communityId = "";
    let magazineId = 0;
    let articleId = 0;

    beforeAll(async () => {
      const database = await import("@/server/db");
      schema = await import("@/server/db/schema");
      const { getPayloadClient } = await import("@/server/payload");
      const { createTRPCRouter } = await import("@/server/api/trpc");
      const { agentMagazineRouter } =
        await import("@/server/api/routers/agent-magazines");
      const { saveMagazineSettings } = await import("./magazine-service");
      db = database.db;
      payload = await getPayloadClient();
      state.ownerId = userId;
      await db.insert(schema.user).values({
        id: userId,
        email: `${userId}@example.test`,
        name: "greg",
      });
      await db.insert(schema.memberProfiles).values({
        userId,
        displayName: "gregy",
      });
      await db.insert(schema.agentProfiles).values({
        id: state.agentId,
        ownerId: userId,
        name: "Nova",
        visibilityMode: "visible",
      });
      const [community] = await db
        .insert(schema.communities)
        .values({
          name: `Issue tool ${sfx}`,
          slug: `issue-tool-${sfx}`,
          createdBy: userId,
          isListedInDirectory: true,
        })
        .returning();
      communityId = community!.id;
      const magazine = await saveMagazineSettings(
        { db, payload },
        { id: communityId, slug: community!.slug, isListedInDirectory: true },
        {
          name: "Town",
          slug: `town-${sfx}`,
          topics: [],
          defaultVisibility: "members",
        },
        userId,
        true,
      );
      magazineId = magazine.id;
      const article = await payload.create({
        collection: "articles",
        draft: true,
        data: {
          title: "Draft article",
          slug: `draft-${sfx}`,
          content: {
            root: {
              type: "root",
              children: [
                {
                  type: "paragraph",
                  children: [{ type: "text", text: "Draft" }],
                },
              ],
            },
          },
          type: "article",
          status: "draft",
          reviewStatus: "draft",
          authorId: userId,
          authorName: "Nova (AI agent of gregy)",
          authorType: "member",
          magazine: magazineId,
        } as never,
      });
      articleId = article.id;
      await db.insert(schema.agentDrafts).values({
        agentId: state.agentId,
        ownerId: userId,
        type: "magazine_article",
        targetType: "articles",
        targetId: String(articleId),
        content: "Draft article",
        status: "draft",
      });
      const caller = createTRPCRouter({
        saveMagazineIssue: agentMagazineRouter.saveMagazineIssue,
      }).createCaller({
        db,
        session: null,
        headers: new Headers({ authorization: "Bearer test-agent-key" }),
      } as never);
      save = (input) => caller.saveMagazineIssue(input);
    }, 120_000);

    afterEach(async () => {
      if (!payload || !magazineId) return;
      await payload.delete({
        collection: "magazine-issues",
        where: { magazine: { equals: magazineId } },
      });
    });

    it("rejects the agent's draft article and creates no issue", async () => {
      const before = await payload.find({
        collection: "magazine-issues",
        where: { magazine: { equals: magazineId } },
        depth: 0,
        limit: 20,
      });
      await expect(
        save({
          magazineSlug: `town-${sfx}`,
          title: "Issue 6",
          articleIds: [articleId],
        }),
      ).rejects.toMatchObject({ message: "ARTICLE_NOT_READY" });
      await expect(
        save({
          magazineSlug: `town-${sfx}`,
          title: "Issue 6",
          items: [{ kind: "article", articleId }],
        }),
      ).rejects.toMatchObject({ message: "ARTICLE_NOT_READY" });
      const after = await payload.find({
        collection: "magazine-issues",
        where: { magazine: { equals: magazineId } },
        depth: 0,
        limit: 20,
      });
      expect(after.docs).toHaveLength(before.docs.length);
      expect(after.docs.map((issue) => issue.title)).not.toContain("Issue 6");
    });

    afterAll(async () => {
      if (!db || !schema) return;
      const { eq, inArray } = await import("drizzle-orm");
      if (articleId) {
        await payload.delete({
          collection: "articles",
          where: { id: { equals: articleId } },
        });
      }
      if (magazineId) {
        await payload.delete({
          collection: "magazine-issues",
          where: { magazine: { equals: magazineId } },
        });
        await payload.delete({
          collection: "magazines",
          where: { id: { equals: magazineId } },
        });
      }
      await db
        .delete(schema.agentDrafts)
        .where(eq(schema.agentDrafts.agentId, state.agentId));
      await db
        .delete(schema.agentProfiles)
        .where(eq(schema.agentProfiles.id, state.agentId));
      if (communityId) {
        await db
          .delete(schema.spaces)
          .where(eq(schema.spaces.communityId, communityId));
        await db
          .delete(schema.communities)
          .where(inArray(schema.communities.id, [communityId]));
      }
      await db
        .delete(schema.memberProfiles)
        .where(eq(schema.memberProfiles.userId, userId));
      await db.delete(schema.user).where(eq(schema.user.id, userId));
    });
  },
);
