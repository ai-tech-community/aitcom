// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type * as Gamification from "@/lib/gamification";
import type * as PublicArticles from "@/server/articles/public-articles";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type { PayloadClient } from "@/server/magazines/deps";
import type * as Drizzle from "drizzle-orm";

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

const RICH_TEXT = {
  root: {
    type: "root",
    direction: "ltr" as const,
    format: "" as const,
    indent: 0,
    version: 1,
    children: [
      {
        type: "paragraph",
        version: 1,
        children: [{ type: "text", text: "article channel integration test" }],
      },
    ],
  },
};

/**
 * The Articles hooks dispatch on the publication channel (ADR-0043): a blog
 * article publishes and credits on approval exactly as before; a magazine
 * article's approval only marks it ready for an issue.
 */
describe.skipIf(!RUN_DB)(
  "article publication channels [DB integration]",
  () => {
    type Mods = {
      db: typeof Db;
      schema: typeof Schema;
      drizzle: typeof Drizzle;
      gamification: typeof Gamification;
      publicArticles: typeof PublicArticles;
      payload: PayloadClient;
    };
    let m: Mods;

    type Fixture = {
      sfx: string;
      authorId: string;
      communityId: string;
      magazineId: number;
      articleIds: number[];
    };
    let fx: Fixture;

    beforeAll(async () => {
      const [
        { db },
        schema,
        drizzle,
        gamification,
        publicArticles,
        { getPayloadClient },
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("drizzle-orm"),
        import("@/lib/gamification"),
        import("@/server/articles/public-articles"),
        import("@/server/payload"),
      ]);
      m = {
        db,
        schema,
        drizzle,
        gamification,
        publicArticles,
        payload: await getPayloadClient(),
      };
    }, 120_000);

    beforeEach(async () => {
      const { db, schema } = m;
      const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const authorId = `ach-author-${sfx}`;
      await db.insert(schema.user).values({
        id: authorId,
        email: `${authorId}@example.test`,
        name: authorId,
      });
      await db
        .insert(schema.memberProfiles)
        .values({ userId: authorId, displayName: authorId, isPublic: true });
      const [community] = await db
        .insert(schema.communities)
        .values({
          name: `Article channels ${sfx}`,
          slug: `ach-${sfx}`,
          createdBy: authorId,
        })
        .returning();
      await db.insert(schema.communityMemberships).values({
        communityId: community!.id,
        userId: authorId,
        role: "owner",
      });
      const magazine = await m.payload.create({
        collection: "magazines",
        data: {
          name: `Channels ${sfx}`,
          slug: `ach-${sfx}`,
          communityId: community!.id,
          createdBy: authorId,
        },
      });
      fx = {
        sfx,
        authorId,
        communityId: community!.id,
        magazineId: magazine.id,
        articleIds: [],
      };
    }, 60_000);

    afterEach(async () => {
      const { db, schema } = m;
      const { eq, inArray } = m.drizzle;
      if (fx.articleIds.length > 0) {
        await m.payload.delete({
          collection: "articles",
          where: { id: { in: fx.articleIds } },
        });
      }
      await m.payload.delete({ collection: "magazines", id: fx.magazineId });
      const ids = [fx.authorId];
      for (const [table, column] of [
        [schema.notifications, schema.notifications.userId],
        [schema.pointsEvents, schema.pointsEvents.userId],
        [schema.memberBadges, schema.memberBadges.userId],
        [schema.memberAwards, schema.memberAwards.userId],
        [schema.activityEvents, schema.activityEvents.actorId],
      ] as const) {
        await db.delete(table).where(inArray(column, ids));
      }
      await db
        .delete(schema.communityMemberships)
        .where(eq(schema.communityMemberships.communityId, fx.communityId));
      await db
        .delete(schema.communities)
        .where(eq(schema.communities.id, fx.communityId));
      await db
        .delete(schema.memberProfiles)
        .where(inArray(schema.memberProfiles.userId, ids));
      await db.delete(schema.user).where(inArray(schema.user.id, ids));
    }, 60_000);

    async function createArticle(
      label: string,
      data: Record<string, unknown> = {},
    ): Promise<number> {
      const doc = await m.payload.create({
        collection: "articles",
        data: {
          title: `Channel ${label} ${fx.sfx}`,
          slug: `ach-${label}-${fx.sfx}`,
          content: RICH_TEXT,
          type: "article",
          authorId: fx.authorId,
          authorName: "Author",
          authorType: "member",
          reviewStatus: "pending_review",
          status: "draft",
          ...data,
        } as never,
      });
      fx.articleIds.push(doc.id);
      return doc.id;
    }

    async function xpOf(userId: string): Promise<number> {
      const [row] = await m.db
        .select({ xp: m.schema.memberProfiles.xp })
        .from(m.schema.memberProfiles)
        .where(m.drizzle.eq(m.schema.memberProfiles.userId, userId));
      return Number(row!.xp);
    }

    async function approvedActivities(articleId: number) {
      const { and, eq } = m.drizzle;
      return m.db
        .select({ action: m.schema.activityEvents.action })
        .from(m.schema.activityEvents)
        .where(
          and(
            eq(m.schema.activityEvents.actorId, fx.authorId),
            eq(m.schema.activityEvents.targetId, String(articleId)),
            eq(m.schema.activityEvents.action, "article.approved"),
          ),
        );
    }

    function reload(id: number) {
      return m.payload.findByID({
        collection: "articles",
        id,
        depth: 0,
        draft: false,
      });
    }

    it("approving a magazine article does not publish it or grant XP", async () => {
      const id = await createArticle("magazine", { magazine: fx.magazineId });
      const before = await xpOf(fx.authorId);

      await m.payload.update({
        collection: "articles",
        id,
        data: { reviewStatus: "approved" },
      });

      const article = await reload(id);
      expect(article.reviewStatus).toBe("approved");
      expect(article.status).toBe("draft");
      expect(article.publishedAt ?? null).toBeNull();
      expect(await xpOf(fx.authorId)).toBe(before);
      expect(await approvedActivities(id)).toEqual([]);
    });

    it("approving a blog article still publishes and grants XP", async () => {
      const id = await createArticle("blog");
      const before = await xpOf(fx.authorId);

      // A partial update, as the review routes send it.
      await m.payload.update({
        collection: "articles",
        id,
        data: { reviewStatus: "approved" },
      });

      const article = await reload(id);
      expect(article.status).toBe("published");
      expect(article.publishedAt).toBeTruthy();
      expect(await xpOf(fx.authorId)).toBe(
        before + m.gamification.XP_AMOUNTS.ARTICLE_PUBLISHED,
      );
      expect(await approvedActivities(id)).toHaveLength(1);
    });

    it("refuses to move a blog article into a magazine", async () => {
      const id = await createArticle("locked");
      await expect(
        m.payload.update({
          collection: "articles",
          id,
          data: { magazine: fx.magazineId },
        }),
      ).rejects.toThrow("ARTICLE_MAGAZINE_LOCKED");
      expect((await reload(id)).magazine ?? null).toBeNull();
    });

    it("the public blog rule finds blog articles and skips magazine ones", async () => {
      const blogId = await createArticle("public-blog", {
        reviewStatus: "approved",
        status: "published",
      });
      const magazineId = await createArticle("public-magazine", {
        magazine: fx.magazineId,
        reviewStatus: "approved",
        status: "published",
      });

      const found = await m.payload.find({
        collection: "articles",
        depth: 0,
        pagination: false,
        where: {
          and: [
            { id: { in: [blogId, magazineId] } },
            m.publicArticles.publicArticleWhere(),
          ],
        },
      });
      expect(found.docs.map((d) => d.id)).toEqual([blogId]);
    });
  },
);
