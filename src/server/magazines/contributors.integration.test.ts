// @vitest-environment node
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { createCaller as CreateCaller } from "@/server/api/root";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { PayloadClient } from "./deps";

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

function richText(text: string) {
  return {
    root: {
      type: "root",
      direction: "ltr" as const,
      format: "" as const,
      indent: 0,
      version: 1,
      children: [
        { type: "paragraph", version: 1, children: [{ type: "text", text }] },
      ],
    },
  };
}

describe.skipIf(!RUN_DB)(
  "magazine contributors [DB integration]",
  { timeout: 30_000 },
  () => {
    let m: {
      db: typeof Db;
      schema: typeof Schema;
      createCaller: typeof CreateCaller;
      payload: PayloadClient;
      articlePublishedXp: number;
    };
    let fx: {
      sfx: string;
      users: {
        owner: string;
        admin: string;
        moderator: string;
        member: string;
        outsider: string;
      };
      community: { id: string; slug: string };
    };

    beforeAll(async () => {
      const [
        { db },
        schema,
        { createCaller },
        { getPayloadClient },
        { XP_AMOUNTS },
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/payload"),
        import("@/lib/gamification"),
      ]);
      m = {
        db,
        schema,
        createCaller,
        payload: await getPayloadClient(),
        articlePublishedXp: XP_AMOUNTS.ARTICLE_PUBLISHED,
      };
    }, 120_000);

    beforeEach(async () => {
      const { db, schema } = m;
      const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const users = {
        owner: `mc-owner-${sfx}`,
        admin: `mc-admin-${sfx}`,
        moderator: `mc-mod-${sfx}`,
        member: `mc-k-${sfx}`,
        outsider: `mc-outside-${sfx}`,
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
          name: `Contributors ${sfx}`,
          slug: `mc-${sfx}`,
          createdBy: users.owner,
          isListedInDirectory: true,
        })
        .returning();
      fx = { sfx, users, community: community! };
      await db.insert(schema.communityMemberships).values(
        Object.entries(users)
          .filter(([job]) => job !== "outsider")
          .map(
            ([job, userId]) =>
              ({
                communityId: fx.community.id,
                userId,
                role:
                  job === "owner" || job === "admin" || job === "moderator"
                    ? job
                    : ("member" as const),
              }) satisfies typeof schema.communityMemberships.$inferInsert,
          ),
      );
    }, 60_000);

    afterEach(async () => {
      if (!fx) return;
      const { db, schema, payload } = m;
      const userIds = Object.values(fx.users);
      await db
        .delete(schema.magazineStaff)
        .where(inArray(schema.magazineStaff.userId, userIds));
      const { docs: magazines } = await payload.find({
        collection: "magazines",
        where: { communityId: { equals: fx.community.id } },
        depth: 0,
        pagination: false,
      });
      const magazineIds = magazines.map((magazine) => magazine.id);
      if (magazineIds.length > 0) {
        await payload.delete({
          collection: "magazine-issues",
          where: { magazine: { in: magazineIds } },
        });
      }
      await payload.delete({
        collection: "articles",
        where: { authorId: { in: userIds } },
      });
      if (magazineIds.length > 0) {
        await payload.delete({
          collection: "magazines",
          where: { id: { in: magazineIds } },
        });
      }
      await db
        .delete(schema.spaces)
        .where(eq(schema.spaces.communityId, fx.community.id));
      await db
        .delete(schema.communityMemberships)
        .where(eq(schema.communityMemberships.communityId, fx.community.id));
      await db
        .delete(schema.communities)
        .where(eq(schema.communities.id, fx.community.id));
      await db
        .delete(schema.pointsEvents)
        .where(inArray(schema.pointsEvents.userId, userIds));
      await db
        .delete(schema.activityEvents)
        .where(inArray(schema.activityEvents.actorId, userIds));
      await db
        .delete(schema.notifications)
        .where(inArray(schema.notifications.userId, userIds));
      await db
        .delete(schema.memberBadges)
        .where(inArray(schema.memberBadges.userId, userIds));
      await db
        .delete(schema.memberProfiles)
        .where(inArray(schema.memberProfiles.userId, userIds));
      await db.delete(schema.user).where(inArray(schema.user.id, userIds));
    }, 60_000);

    function callerAs(userId: string | null) {
      return m.createCaller({
        db: m.db,
        headers: new Headers(),
        session: userId
          ? ({ user: { id: userId, name: userId }, session: {} } as never)
          : null,
      });
    }

    it("a member goes from team invite to published contributor", async () => {
      const owner = callerAs(fx.users.owner);
      const k = callerAs(fx.users.member);
      const outsider = callerAs(fx.users.outsider);
      const anonymous = callerAs(null);
      const slug = fx.community.slug;
      const magazine = await owner.magazines.saveSettings({
        slug,
        name: "The Gazette",
        magazineSlug: `mc-gazette-${fx.sfx}`,
        topics: [],
        defaultVisibility: "public",
      });
      const before = await k.members.getMyProfile();
      expect(before.badges).toEqual([]);

      await owner.magazines.assignStaffRole({
        slug,
        userId: fx.users.member,
        role: "contributor",
      });
      expect((await k.notifications.list({})).notifications).toEqual([
        expect.objectContaining({ type: "magazine_role_assigned" }),
      ]);

      const article = await k.articles.create({
        title: "K's first story",
        slug: `mc-first-story-${fx.sfx}`,
        content: richText("An introduction that needs to be shorter."),
        type: "article",
        magazineId: magazine.id,
      });
      await expect(
        k.articles.submit({ id: article.id }),
      ).resolves.toMatchObject({
        status: "draft",
        reviewStatus: "pending_review",
      });
      expect((await owner.notifications.list({})).notifications).toEqual([
        expect.objectContaining({ type: "magazine_article_submitted" }),
      ]);

      await owner.magazines.reviewArticle({
        slug,
        articleId: article.id,
        decision: "request_changes",
        note: "Shorter intro",
      });
      expect(await k.magazines.myDraftArticles({ slug })).toEqual([
        expect.objectContaining({
          id: article.id,
          reviewStatus: "changes_requested",
          reviewNote: "Shorter intro",
        }),
      ]);

      const revisedContent = richText("A shorter introduction.");
      await k.articles.update({ id: article.id, content: revisedContent });
      await k.articles.submit({ id: article.id });
      await owner.magazines.reviewArticle({
        slug,
        articleId: article.id,
        decision: "approve",
      });
      expect(await owner.magazines.availableArticles({ slug })).toEqual([
        expect.objectContaining({ id: article.id }),
      ]);
      const approved = await k.members.getMyProfile();
      expect(approved.profile!.xp).toBe(before.profile!.xp);
      expect(approved.badges).toEqual([]);
      // comments.list uses the shared article read check; an outsider must
      // not read the approved article before its issue is published.
      await expect(
        outsider.comments.list({ articleId: article.id }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      const issue = await owner.magazines.createIssue({
        slug,
        title: "Our first issue",
      });
      const editing = await owner.magazines.getIssueForEditing({
        slug,
        issueId: issue.id,
      });
      const saved = await owner.magazines.setIssueItems({
        slug,
        issueId: issue.id,
        expectedUpdatedAt: editing.issue.updatedAt,
        items: [{ kind: "article", articleId: article.id }],
      });
      await expect(
        owner.magazines.publishIssue({
          slug,
          issueId: issue.id,
          expectedUpdatedAt: saved.issue.updatedAt,
        }),
      ).resolves.toMatchObject({ status: "published", visibility: "public" });
      expect(await k.articles.getBySlug({ slug: article.slug })).toMatchObject({
        status: "published",
        content: revisedContent,
      });
      const published = await k.members.getMyProfile();
      expect(published.profile!.xp).toBe(
        before.profile!.xp + m.articlePublishedXp,
      );
      expect(published.badges.map((badge) => badge.slug).sort()).toEqual([
        "article_author",
        "magazine_published",
      ]);
      await expect(
        outsider.comments.list({ articleId: article.id }),
      ).resolves.toEqual([]);
      await expect(
        anonymous.comments.list({ articleId: article.id }),
      ).resolves.toEqual([]);

      await expect(
        k.magazines.getIssueForEditing({ slug, issueId: issue.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(k.magazines.reviewQueue({ slug })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      await owner.magazines.removeStaffRole({ slug, userId: fx.users.member });
      await expect(
        k.articles.create({
          title: "Another story",
          slug: `mc-another-story-${fx.sfx}`,
          content: richText("A new story."),
          type: "article",
          magazineId: magazine.id,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      for (const reader of [k, outsider, anonymous]) {
        await expect(
          reader.comments.list({ articleId: article.id }),
        ).resolves.toEqual([]);
      }
    });
  },
);
