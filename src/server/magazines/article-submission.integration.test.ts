// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Article } from "@/payload-types";
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
  "magazine article hand-ins [DB integration]",
  { timeout: 30_000 },
  () => {
    let m: {
      db: typeof Db;
      schema: typeof Schema;
      createCaller: typeof CreateCaller;
      payload: PayloadClient;
    };
    let fx: {
      sfx: string;
      ownerId: string;
      editorId: string;
      contributorId: string;
      memberId: string;
      community: { id: string; slug: string };
      magazineId: number;
    };

    beforeAll(async () => {
      const [{ db }, schema, { createCaller }, { getPayloadClient }] =
        await Promise.all([
          import("@/server/db"),
          import("@/server/db/schema"),
          import("@/server/api/root"),
          import("@/server/payload"),
        ]);
      m = { db, schema, createCaller, payload: await getPayloadClient() };
    }, 120_000);

    beforeEach(async () => {
      const { db, schema } = m;
      const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const ids = {
        ownerId: `ms-owner-${sfx}`,
        editorId: `ms-editor-${sfx}`,
        contributorId: `ms-writer-${sfx}`,
        memberId: `ms-member-${sfx}`,
      };
      await db.insert(schema.user).values(
        Object.values(ids).map((id) => ({
          id,
          email: `${id}@example.test`,
          name: id,
        })),
      );
      await db
        .insert(schema.memberProfiles)
        .values(
          Object.values(ids).map((userId) => ({ userId, displayName: userId })),
        );
      const [community] = await db
        .insert(schema.communities)
        .values({
          name: `Hand-ins ${sfx}`,
          slug: `ms-${sfx}`,
          createdBy: ids.ownerId,
        })
        .returning();
      await db.insert(schema.communityMemberships).values(
        Object.values(ids).map((userId) => ({
          communityId: community!.id,
          userId,
          role:
            userId === ids.ownerId ? ("owner" as const) : ("member" as const),
        })),
      );
      const magazine = await callerAs(ids.ownerId).magazines.saveSettings({
        slug: community!.slug,
        name: "The Gazette",
        magazineSlug: `ms-gazette-${sfx}`,
        topics: [],
        defaultVisibility: "members",
      });
      fx = { sfx, ...ids, community: community!, magazineId: magazine.id };
      await db.insert(schema.magazineStaff).values([
        {
          magazineId: magazine.id,
          communityId: community!.id,
          userId: ids.editorId,
          role: "editor",
          assignedBy: ids.ownerId,
        },
        {
          magazineId: magazine.id,
          communityId: community!.id,
          userId: ids.contributorId,
          role: "contributor",
          assignedBy: ids.ownerId,
        },
      ]);
    }, 60_000);

    afterEach(async () => {
      const { db, schema, payload } = m;
      const { eq, inArray } = await import("drizzle-orm");
      const userIds = [fx.ownerId, fx.editorId, fx.contributorId, fx.memberId];
      await db
        .delete(schema.magazineStaff)
        .where(inArray(schema.magazineStaff.userId, userIds));
      await payload.delete({
        collection: "magazine-issues",
        where: { magazine: { equals: fx.magazineId } },
      });
      await payload.delete({
        collection: "articles",
        where: { authorId: { in: userIds } },
      });
      await payload.delete({ collection: "magazines", id: fx.magazineId });
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

    function callerAs(userId: string) {
      return m.createCaller({
        db: m.db,
        headers: new Headers(),
        session: { user: { id: userId, name: userId }, session: {} } as never,
      });
    }

    function writeArticle(userId = fx.contributorId) {
      return callerAs(userId).articles.create({
        title: "Original story",
        slug: `ms-story-${fx.sfx}`,
        content: richText("Original text"),
        type: "article",
        magazineId: fx.magazineId,
      });
    }

    function latest(id: number) {
      return m.payload.findByID({
        collection: "articles",
        id,
        draft: true,
        depth: 0,
      });
    }

    function setReview(
      id: number,
      reviewStatus: Article["reviewStatus"],
      reviewNote: string | null = null,
    ) {
      return m.payload.update({
        collection: "articles",
        id,
        data: { reviewStatus, reviewNote },
      });
    }

    async function submittedNotices() {
      const { and, eq } = await import("drizzle-orm");
      return m.db.query.notifications.findMany({
        where: and(
          eq(m.schema.notifications.communityId, fx.community.id),
          eq(m.schema.notifications.type, "magazine_article_submitted"),
        ),
      });
    }

    async function xpOf(userId: string) {
      const { eq } = await import("drizzle-orm");
      const profile = await m.db.query.memberProfiles.findFirst({
        where: eq(m.schema.memberProfiles.userId, userId),
      });
      return Number(profile!.xp);
    }

    it("a contributor writes for the magazine; a member may not", async () => {
      await expect(writeArticle()).resolves.toMatchObject({
        magazine: { id: fx.magazineId },
        authorId: fx.contributorId,
        status: "draft",
      });
      await expect(writeArticle(fx.memberId)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("sending in makes the article wait for the editors and tells each editor once", async () => {
      const article = await writeArticle();
      const xp = await xpOf(fx.contributorId);
      await expect(
        callerAs(fx.contributorId).articles.submit({ id: article.id }),
      ).resolves.toMatchObject({
        reviewStatus: "pending_review",
        status: "draft",
      });
      expect(await latest(article.id)).toMatchObject({
        reviewStatus: "pending_review",
        status: "draft",
      });
      const notices = await submittedNotices();
      expect(notices.map((n) => n.userId).sort()).toEqual(
        [fx.ownerId, fx.editorId].sort(),
      );
      for (const notice of notices) {
        expect(notice).toMatchObject({
          title: `${fx.contributorId} sent “Original story” to The Gazette`,
          content: "Read it, then approve it, ask for changes or decline it.",
          metadata: {
            reviewPath: `/communities/${fx.community.slug}/magazine/review/${article.slug}`,
            linkLabel: "Read the article",
          },
        });
      }
      expect(await xpOf(fx.contributorId)).toBe(xp);
    });

    it("the submitted notice names an unnamed writer as a member", async () => {
      const article = await writeArticle();
      await m.payload.update({
        collection: "articles",
        id: article.id,
        data: { authorName: null },
        draft: true,
      });
      await callerAs(fx.contributorId).articles.submit({ id: article.id });
      const notices = await submittedNotices();
      expect(notices).toHaveLength(2);
      expect(notices.map((n) => n.title)).toEqual([
        "A member sent “Original story” to The Gazette",
        "A member sent “Original story” to The Gazette",
      ]);
    });

    it("an editor's own hand-in still approves directly", async () => {
      const article = await writeArticle(fx.editorId);
      const xp = await xpOf(fx.editorId);
      await expect(
        callerAs(fx.editorId).articles.submit({ id: article.id }),
      ).resolves.toMatchObject({ reviewStatus: "approved", status: "draft" });
      expect(await submittedNotices()).toEqual([]);
      expect(await xpOf(fx.editorId)).toBe(xp);
    });

    it("a sent, approved or declined article is locked for its contributor", async () => {
      const article = await writeArticle();
      const writer = callerAs(fx.contributorId).articles;
      for (const status of [
        "pending_review",
        "approved",
        "rejected",
      ] as const) {
        await setReview(article.id, status);
        for (const action of [
          () => writer.update({ id: article.id, title: "Changed story" }),
          () => writer.submit({ id: article.id }),
          () => writer.delete({ id: article.id }),
        ])
          await expect(action()).rejects.toMatchObject({
            code: "CONFLICT",
            message: "ARTICLE_LOCKED",
          });
        expect(await latest(article.id)).toMatchObject({
          title: "Original story",
          reviewStatus: status,
        });
      }
      await setReview(article.id, "changes_requested", "Shorter intro");
      await expect(
        writer.update({ id: article.id, title: "Shorter story" }),
      ).resolves.toMatchObject({
        reviewStatus: null,
        reviewNote: "Shorter intro",
      });
      expect(await latest(article.id)).toMatchObject({
        reviewStatus: null,
        reviewNote: "Shorter intro",
      });
      await expect(writer.submit({ id: article.id })).resolves.toMatchObject({
        reviewStatus: "pending_review",
        reviewNote: null,
      });
      expect(await latest(article.id)).toMatchObject({
        title: "Shorter story",
        reviewNote: null,
      });
      const unsent = await writeArticle();
      await expect(writer.delete({ id: unsent.id })).resolves.toEqual({
        success: true,
      });
      await expect(
        m.payload.findByID({
          collection: "articles",
          id: unsent.id,
          draft: true,
          disableErrors: true,
        }),
      ).resolves.toBeNull();
    });

    it("a published article is locked for its contributor", async () => {
      const article = await writeArticle();
      await m.payload.update({
        collection: "articles",
        id: article.id,
        data: { status: "published" },
      });
      const writer = callerAs(fx.contributorId).articles;
      for (const action of [
        () => writer.update({ id: article.id, title: "Changed story" }),
        () => writer.submit({ id: article.id }),
        () => writer.delete({ id: article.id }),
      ])
        await expect(action()).rejects.toMatchObject({
          code: "CONFLICT",
          message: "ARTICLE_LOCKED",
        });
      expect(await latest(article.id)).toMatchObject({
        status: "published",
        title: "Original story",
      });
      expect(await submittedNotices()).toEqual([]);
    });

    it("a contributor removed from the team can no longer write, send in or delete", async () => {
      const article = await writeArticle();
      await setReview(article.id, "pending_review");
      const { eq } = await import("drizzle-orm");
      await m.db
        .delete(m.schema.magazineStaff)
        .where(eq(m.schema.magazineStaff.userId, fx.contributorId));
      const writer = callerAs(fx.contributorId).articles;
      for (const action of [
        () => writeArticle(),
        () => writer.update({ id: article.id, title: "Changed story" }),
        () => writer.submit({ id: article.id }),
        () => writer.delete({ id: article.id }),
      ])
        await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await latest(article.id)).toMatchObject({
        reviewStatus: "pending_review",
        title: "Original story",
      });
      expect(await submittedNotices()).toEqual([]);
    });

    it.each(["left", "banned"] as const)(
      "a contributor who has %s the community cannot write, send in or delete",
      async (status) => {
        const article = await writeArticle();
        await setReview(article.id, "pending_review");
        const { and, eq } = await import("drizzle-orm");
        const membership = and(
          eq(m.schema.communityMemberships.communityId, fx.community.id),
          eq(m.schema.communityMemberships.userId, fx.contributorId),
        );
        if (status === "left")
          await m.db.delete(m.schema.communityMemberships).where(membership);
        else
          await m.db
            .update(m.schema.communityMemberships)
            .set({ status: "banned" })
            .where(membership);
        const writer = callerAs(fx.contributorId).articles;
        for (const action of [
          () => writeArticle(),
          () => writer.update({ id: article.id, title: "Changed story" }),
          () => writer.submit({ id: article.id }),
          () => writer.delete({ id: article.id }),
        ])
          await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(await latest(article.id)).toMatchObject({
          reviewStatus: "pending_review",
          title: "Original story",
        });
        expect(await submittedNotices()).toEqual([]);
      },
    );

    it("a soft-deleted community's contributor cannot write", async () => {
      const article = await writeArticle();
      const { eq } = await import("drizzle-orm");
      await m.db
        .update(m.schema.communities)
        .set({ deletedAt: new Date() })
        .where(eq(m.schema.communities.id, fx.community.id));
      const writer = callerAs(fx.contributorId).articles;
      for (const action of [
        () => writeArticle(),
        () => writer.update({ id: article.id, title: "Changed story" }),
        () => writer.submit({ id: article.id }),
        () => writer.delete({ id: article.id }),
      ])
        await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await latest(article.id)).toMatchObject({
        title: "Original story",
        reviewStatus: null,
      });
      expect(await submittedNotices()).toEqual([]);
    });

    it("two send-ins at once notify each editor once", async () => {
      const article = await writeArticle();
      const writer = callerAs(fx.contributorId).articles;
      const results = await Promise.allSettled([
        writer.submit({ id: article.id }),
        writer.submit({ id: article.id }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { code: "CONFLICT", message: "ARTICLE_LOCKED" },
      });
      expect((await submittedNotices()).map((n) => n.userId).sort()).toEqual(
        [fx.ownerId, fx.editorId].sort(),
      );
      expect(await latest(article.id)).toMatchObject({
        reviewStatus: "pending_review",
      });
    });

    it("a save racing a send-in cannot change the sent text", async () => {
      const article = await writeArticle();
      const writer = callerAs(fx.contributorId).articles;
      const [save, submit] = await Promise.allSettled([
        writer.update({ id: article.id, title: "Late" }),
        writer.submit({ id: article.id }),
      ]);
      expect(submit.status).toBe("fulfilled");
      if (save.status === "rejected")
        expect(save.reason).toMatchObject({
          code: "CONFLICT",
          message: "ARTICLE_LOCKED",
        });
      expect(await latest(article.id)).toMatchObject({
        reviewStatus: "pending_review",
        title: save.status === "fulfilled" ? "Late" : "Original story",
      });
      expect(await submittedNotices()).toHaveLength(2);
    });

    it("myDraftArticles shows the contributor their articles with the editor's note", async () => {
      const article = await writeArticle();
      await setReview(article.id, "changes_requested", "Shorter intro");
      await expect(
        callerAs(fx.contributorId).magazines.myDraftArticles({
          slug: fx.community.slug,
        }),
      ).resolves.toEqual([
        expect.objectContaining({
          id: article.id,
          reviewStatus: "changes_requested",
          reviewNote: "Shorter intro",
        }),
      ]);
    });
  },
);
