// @vitest-environment node
import { TRPCError } from "@trpc/server";
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

import {
  communityMagazinePath,
  magazineArticleEditPath,
} from "@/lib/magazines/paths";
import type { ReviewDecision } from "@/lib/magazines/review";
import type { Article, Magazine } from "@/payload-types";
import type { createCaller as CreateCaller } from "@/server/api/root";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { Deps, PayloadClient } from "./deps";
import { interleaveArticleWrites } from "./test-row-lock";

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
  "magazine article review [DB integration]",
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
      users: {
        owner: string;
        admin: string;
        editor: string;
        k: string;
        l: string;
        moderator: string;
        member: string;
        outsider: string;
      };
      community: { id: string; slug: string };
      magazine: Magazine;
      k: Article;
      l: Article;
    };
    let extraMagazineIds: number[];

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
      extraMagazineIds = [];
      const { db, schema } = m;
      const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const users = {
        owner: `mr-owner-${sfx}`,
        admin: `mr-admin-${sfx}`,
        editor: `mr-editor-${sfx}`,
        k: `mr-k-${sfx}`,
        l: `mr-l-${sfx}`,
        moderator: `mr-mod-${sfx}`,
        member: `mr-member-${sfx}`,
        outsider: `mr-outside-${sfx}`,
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
          name: `Review ${sfx}`,
          slug: `mr-${sfx}`,
          createdBy: users.owner,
        })
        .returning();
      await db.insert(schema.communityMemberships).values(
        Object.entries(users)
          .filter(([job]) => job !== "outsider")
          .map(
            ([job, userId]) =>
              ({
                communityId: community!.id,
                userId,
                role:
                  job === "owner" || job === "admin" || job === "moderator"
                    ? job
                    : ("member" as const),
              }) satisfies typeof schema.communityMemberships.$inferInsert,
          ),
      );
      const magazine = await callerAs(users.owner).magazines.saveSettings({
        slug: community!.slug,
        name: "The Gazette",
        magazineSlug: `mr-gazette-${sfx}`,
        topics: [],
        defaultVisibility: "members",
      });
      await db.insert(schema.magazineStaff).values(
        (["editor", "k", "l"] as const).map((job) => ({
          magazineId: magazine.id,
          communityId: community!.id,
          userId: users[job],
          role:
            job === "editor" ? ("editor" as const) : ("contributor" as const),
          assignedBy: users.owner,
        })),
      );
      async function sendIn(userId: string, name: string) {
        const writer = callerAs(userId).articles;
        const article = await writer.create({
          title: `${name}'s story`,
          slug: `mr-${name}-${sfx}`,
          content: richText(`${name}'s text`),
          type: "article",
          magazineId: magazine.id,
        });
        return writer.submit({ id: article.id });
      }
      fx = {
        sfx,
        users,
        community: community!,
        magazine,
        k: await sendIn(users.k, "K"),
        l: await sendIn(users.l, "L"),
      };
    }, 60_000);

    afterEach(async () => {
      vi.restoreAllMocks();
      if (!fx) return;
      const { db, schema, payload } = m;
      const userIds = Object.values(fx.users);
      await db
        .delete(schema.magazineStaff)
        .where(inArray(schema.magazineStaff.userId, userIds));
      await payload.delete({
        collection: "magazine-issues",
        where: { magazine: { equals: fx.magazine.id } },
      });
      await payload.delete({
        collection: "articles",
        where: { authorId: { in: userIds } },
      });
      for (const id of [...extraMagazineIds, fx.magazine.id])
        await payload.delete({ collection: "magazines", id });
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

    function review(
      decision: ReviewDecision,
      articleId = fx.k.id,
      note?: string,
      userId = fx.users.editor,
    ) {
      return callerAs(userId).magazines.reviewArticle({
        slug: fx.community.slug,
        articleId,
        decision,
        note,
      });
    }

    function latest(id = fx.k.id) {
      return m.payload.findByID({
        collection: "articles",
        id,
        draft: true,
        depth: 0,
      });
    }

    function reviewedNotices(userId = fx.users.k) {
      return m.db.query.notifications.findMany({
        where: and(
          eq(m.schema.notifications.userId, userId),
          eq(m.schema.notifications.type, "magazine_article_reviewed"),
        ),
      });
    }

    function reviewedActivities() {
      return m.db.query.activityEvents.findMany({
        where: and(
          eq(m.schema.activityEvents.communityId, fx.community.id),
          eq(m.schema.activityEvents.action, "magazine_article.reviewed"),
        ),
      });
    }

    async function decideWith(
      db: Deps["db"],
      note?: string,
      payload = m.payload,
    ) {
      const { reviewMagazineArticle } = await import("./article-review");
      return reviewMagazineArticle(
        { db, payload },
        fx.magazine,
        { articleId: fx.k.id, decision: "request_changes", note },
        { userId: fx.users.editor, community: fx.community },
      );
    }

    it("lists articles waiting for the editors, oldest first", async () => {
      await m.payload.create({
        collection: "articles",
        data: {
          title: "Already ready",
          content: richText("Ready text"),
          status: "draft",
          slug: `mr-ready-${fx.sfx}`,
          type: "article",
          authorType: "member",
          authorId: fx.users.editor,
          magazine: fx.magazine.id,
          reviewStatus: "approved",
        },
      });
      await callerAs(fx.users.k).articles.create({
        title: "Still writing",
        slug: `mr-draft-${fx.sfx}`,
        content: richText("Not sent"),
        type: "article",
        magazineId: fx.magazine.id,
      });
      expect(
        await callerAs(fx.users.editor).magazines.reviewQueue({
          slug: fx.community.slug,
        }),
      ).toEqual(
        [fx.k, fx.l].map((article) => ({
          id: article.id,
          slug: article.slug,
          title: article.title,
          authorName: article.authorName,
          sentAt: article.updatedAt,
        })),
      );
    });

    it("approve readies the article without publishing or crediting it", async () => {
      const profile = () =>
        m.db.query.memberProfiles.findFirst({
          where: eq(m.schema.memberProfiles.userId, fx.users.k),
        });
      const before = await profile();
      await expect(
        review("approve", fx.k.id, "Ignore this note"),
      ).resolves.toEqual({
        reviewStatus: "approved",
      });
      expect(await latest()).toMatchObject({
        reviewStatus: "approved",
        status: "draft",
        reviewNote: null,
      });
      expect((await profile())!.xp).toBe(before!.xp);
      expect(await reviewedNotices()).toEqual([
        expect.objectContaining({
          title: "“K's story” is ready for an issue",
          content:
            "An editor of The Gazette approved your article. It goes live when an issue with it is published.",
          metadata: {
            communityId: fx.community.id,
            reviewPath: communityMagazinePath(fx.community.slug),
            linkLabel: "Open the magazine",
          },
        }),
      ]);
      expect(await reviewedActivities()).toEqual([
        expect.objectContaining({
          actorId: fx.users.editor,
          actorType: "member",
          targetType: "articles",
          targetId: String(fx.k.id),
          metadata: expect.objectContaining({
            decision: "approve",
            magazineId: fx.magazine.id,
            title: "K's story",
          }),
        }),
      ]);
      expect(
        await callerAs(fx.users.editor).magazines.availableArticles({
          slug: fx.community.slug,
        }),
      ).toEqual([expect.objectContaining({ id: fx.k.id })]);
    });

    it("asking for changes needs a note and sends the writer back to the editor", async () => {
      for (const note of [undefined, "", "   "])
        await expect(
          review("request_changes", fx.k.id, note),
        ).rejects.toMatchObject({
          code: "BAD_REQUEST",
          message: "REVIEW_NOTE_REQUIRED",
        });
      expect(await latest()).toMatchObject({ reviewStatus: "pending_review" });
      expect(await reviewedNotices()).toEqual([]);
      expect(await reviewedActivities()).toEqual([]);
      await expect(
        review("request_changes", fx.k.id, "  Add a source  "),
      ).resolves.toEqual({
        reviewStatus: "changes_requested",
      });
      expect(await latest()).toMatchObject({
        reviewStatus: "changes_requested",
        reviewNote: "Add a source",
        status: "draft",
      });
      expect(await reviewedNotices()).toEqual([
        expect.objectContaining({
          title: "Changes asked for “K's story”",
          content: "Add a source",
          metadata: expect.objectContaining({
            reviewPath: magazineArticleEditPath(fx.community.slug, fx.k.slug),
            linkLabel: "Open your article",
          }),
        }),
      ]);
      expect(await reviewedActivities()).toEqual([
        expect.objectContaining({
          actorId: fx.users.editor,
          metadata: expect.objectContaining({ decision: "request_changes" }),
        }),
      ]);
    });

    it("checks a required note before any read", async () => {
      const unavailable = new Proxy(m.db, {
        get() {
          throw new Error("Database read before note validation");
        },
      });
      const unavailablePayload = new Proxy(m.payload, {
        get() {
          throw new Error("Payload read before note validation");
        },
      });
      await expect(
        decideWith(unavailable, "   ", unavailablePayload),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "REVIEW_NOTE_REQUIRED",
      });
    });

    it("declining works with or without a note", async () => {
      await expect(
        review("reject", fx.k.id, "  Not this time  "),
      ).resolves.toEqual({
        reviewStatus: "rejected",
      });
      await expect(review("reject", fx.l.id, "   ")).resolves.toEqual({
        reviewStatus: "rejected",
      });
      expect(await latest()).toMatchObject({
        reviewStatus: "rejected",
        reviewNote: "Not this time",
      });
      expect(await latest(fx.l.id)).toMatchObject({
        reviewStatus: "rejected",
        reviewNote: null,
      });
      for (const [userId, title, content] of [
        [fx.users.k, "K's story", "Not this time"],
        [
          fx.users.l,
          "L's story",
          "An editor of The Gazette decided not to use this article.",
        ],
      ])
        expect(await reviewedNotices(userId)).toEqual([
          expect.objectContaining({
            title: `“${title}” was not accepted`,
            content,
            metadata: expect.objectContaining({
              reviewPath: communityMagazinePath(fx.community.slug),
              linkLabel: "Open the magazine",
            }),
          }),
        ]);
      expect(await reviewedActivities()).toHaveLength(2);
      for (const activity of await reviewedActivities())
        expect(activity).toMatchObject({
          actorId: fx.users.editor,
          metadata: { decision: "reject" },
        });
    });

    it("a second decision is refused and sends no second notice", async () => {
      await review("approve");
      await expect(review("reject")).rejects.toMatchObject({
        code: "CONFLICT",
        message: "ARTICLE_NOT_PENDING",
      });
      expect(await latest()).toMatchObject({ reviewStatus: "approved" });
      expect(await reviewedNotices()).toHaveLength(1);
      expect(await reviewedActivities()).toHaveLength(1);
    });

    it("two decisions at once: one wins, one notice", async () => {
      const results = await interleaveArticleWrites(
        m.payload,
        fx.l.id,
        () => review("approve", fx.l.id),
        () => review("reject", fx.l.id, undefined, fx.users.owner),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected"),
      ).toMatchObject({
        reason: { code: "CONFLICT", message: "ARTICLE_NOT_PENDING" },
      });
      const winner = results.find((result) => result.status === "fulfilled")!;
      expect(await latest(fx.l.id)).toMatchObject(winner.value);
      expect(await reviewedNotices(fx.users.l)).toHaveLength(1);
      expect(await reviewedActivities()).toHaveLength(1);
    });

    it("a contributor cannot approve their own article", async () => {
      await expect(
        review("approve", fx.k.id, undefined, fx.users.k),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await latest()).toMatchObject({ reviewStatus: "pending_review" });
      expect(await reviewedNotices()).toEqual([]);
    });

    it("refuses another magazine's article, or a deleted one, as not found", async () => {
      const other = await m.payload.create({
        collection: "magazines",
        data: {
          name: "Another magazine",
          slug: `mr-other-${fx.sfx}`,
          communityId: `mr-other-${fx.sfx}`,
          createdBy: fx.users.owner,
        },
      });
      extraMagazineIds.push(other.id);
      const foreign = await m.payload.create({
        collection: "articles",
        data: {
          title: "Another story",
          content: richText("Another text"),
          status: "draft",
          slug: `mr-foreign-${fx.sfx}`,
          type: "article",
          authorType: "member",
          authorId: fx.users.k,
          magazine: other.id,
          reviewStatus: "pending_review",
        },
      });
      const { loadArticleForReview } = await import("./article-review");
      expect(
        await loadArticleForReview(m, {
          communitySlug: fx.community.slug,
          articleSlug: foreign.slug,
          viewerId: fx.users.editor,
        }),
      ).toBeNull();
      await m.payload.delete({ collection: "articles", id: fx.l.id });
      for (const articleId of [foreign.id, fx.l.id]) {
        const error: unknown = await review("approve", articleId).catch(
          (error: unknown) => error,
        );
        expect(error).toBeInstanceOf(TRPCError);
        expect(error).toMatchObject({ code: "NOT_FOUND" });
      }
      expect(await reviewedNotices()).toEqual([]);
      expect(await reviewedActivities()).toEqual([]);
    });

    it("editors decide on an article whose writer left the team", async () => {
      await m.db
        .delete(m.schema.magazineStaff)
        .where(eq(m.schema.magazineStaff.userId, fx.users.l));
      await m.db
        .update(m.schema.communityMemberships)
        .set({ status: "banned" })
        .where(
          and(
            eq(m.schema.communityMemberships.communityId, fx.community.id),
            eq(m.schema.communityMemberships.userId, fx.users.l),
          ),
        );
      expect(
        await callerAs(fx.users.editor).magazines.reviewQueue({
          slug: fx.community.slug,
        }),
      ).toContainEqual(expect.objectContaining({ id: fx.l.id }));
      await expect(review("approve", fx.l.id)).resolves.toEqual({
        reviewStatus: "approved",
      });
      expect(await reviewedNotices(fx.users.l)).toHaveLength(1);
    });

    it("the review page loads for editors only", async () => {
      const { loadArticleForReview } = await import("./article-review");
      await m.payload.update({
        collection: "articles",
        id: fx.k.id,
        data: { content: richText("Latest draft text") },
        draft: true,
      });
      const load = (viewerId: string | null, articleSlug = fx.k.slug) =>
        loadArticleForReview(m, {
          communitySlug: fx.community.slug,
          articleSlug,
          viewerId,
        });
      for (const viewerId of [fx.users.editor, fx.users.owner, fx.users.admin])
        expect(await load(viewerId)).toMatchObject({
          magazine: { id: fx.magazine.id, name: "The Gazette" },
          article: {
            id: fx.k.id,
            title: "K's story",
            type: "article",
            authorName: fx.users.k,
            content: richText("Latest draft text"),
            reviewStatus: "pending_review",
            reviewNote: null,
          },
        });
      for (const viewerId of [
        fx.users.k,
        fx.users.l,
        fx.users.moderator,
        fx.users.member,
        fx.users.outsider,
        null,
      ])
        expect(await load(viewerId)).toBeNull();
      expect(await load(fx.users.editor, "missing-article")).toBeNull();
      const adminArticle = await m.payload.create({
        collection: "articles",
        data: {
          title: "Admin text",
          content: richText("Admin text"),
          status: "draft",
          slug: `mr-admin-text-${fx.sfx}`,
          type: "article",
          authorId: fx.users.owner,
          authorType: "admin",
          magazine: fx.magazine.id,
        },
      });
      expect(await load(fx.users.editor, adminArticle.slug)).toBeNull();
    });

    it("a soft-deleted community refuses decisions and hides the review page", async () => {
      const { loadArticleForReview } = await import("./article-review");
      await m.db
        .update(m.schema.communities)
        .set({ deletedAt: new Date() })
        .where(eq(m.schema.communities.id, fx.community.id));
      await expect(review("approve")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(decideWith(m.db, "Add a source")).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(
        await loadArticleForReview(m, {
          communitySlug: fx.community.slug,
          articleSlug: fx.k.slug,
          viewerId: fx.users.editor,
        }),
      ).toBeNull();
      expect(await latest()).toMatchObject({ reviewStatus: "pending_review" });
      expect(await reviewedNotices()).toEqual([]);
    });

    it("a notice failure never fails the committed decision", async () => {
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const database = new Proxy(m.db, {
        get(target, property, receiver) {
          if (property === "insert")
            return (table: Parameters<Deps["db"]["insert"]>[0]) => {
              if (table === m.schema.notifications)
                throw new Error("Inbox unavailable");
              return target.insert(table);
            };
          return Reflect.get(target, property, receiver) as unknown;
        },
      });
      await expect(decideWith(database, "Add a source")).resolves.toEqual({
        reviewStatus: "changes_requested",
      });
      expect(await latest()).toMatchObject({
        reviewStatus: "changes_requested",
      });
      expect(await reviewedActivities()).toHaveLength(1);
      expect(await reviewedNotices()).toEqual([]);
      expect(log).toHaveBeenCalledWith(
        "[magazines] notification failed",
        expect.any(Error),
      );
    });

    it("an activity failure never fails the committed decision or skips its notice", async () => {
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const database = new Proxy(m.db, {
        get(target, property, receiver) {
          if (property === "insert")
            return (table: Parameters<Deps["db"]["insert"]>[0]) => {
              if (table === m.schema.activityEvents)
                throw new Error("Activity log unavailable");
              return target.insert(table);
            };
          return Reflect.get(target, property, receiver) as unknown;
        },
      });
      await expect(decideWith(database, "Add a source")).resolves.toEqual({
        reviewStatus: "changes_requested",
      });
      expect(await latest()).toMatchObject({
        reviewStatus: "changes_requested",
      });
      expect(await reviewedActivities()).toEqual([]);
      expect(await reviewedNotices()).toHaveLength(1);
      expect(log).toHaveBeenCalledWith(
        "[magazines] activity failed",
        expect.any(Error),
      );
    });

    it("a community deleted after commit receives no notice", async () => {
      const commit = m.payload.db.commitTransaction.bind(m.payload.db);
      vi.spyOn(m.payload.db, "commitTransaction").mockImplementation(
        async (id) => {
          await commit(id);
          await m.db
            .update(m.schema.communities)
            .set({ deletedAt: new Date() })
            .where(eq(m.schema.communities.id, fx.community.id));
        },
      );
      await expect(decideWith(m.db, "Add a source")).resolves.toEqual({
        reviewStatus: "changes_requested",
      });
      expect(await latest()).toMatchObject({
        reviewStatus: "changes_requested",
      });
      expect(await reviewedNotices()).toEqual([]);
    });

    it("a notice lookup failure never fails the committed decision", async () => {
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const commit = m.payload.db.commitTransaction.bind(m.payload.db);
      vi.spyOn(m.payload.db, "commitTransaction").mockImplementation(
        async (id) => {
          await commit(id);
          vi.spyOn(m.db.query.communities, "findFirst").mockRejectedValue(
            new Error("Community lookup unavailable"),
          );
        },
      );
      await expect(decideWith(m.db, "Add a source")).resolves.toEqual({
        reviewStatus: "changes_requested",
      });
      expect(await latest()).toMatchObject({
        reviewStatus: "changes_requested",
      });
      expect(await reviewedActivities()).toHaveLength(1);
      expect(await reviewedNotices()).toEqual([]);
      expect(log).toHaveBeenCalledWith(
        "[magazines] notification failed",
        expect.any(Error),
      );
    });
  },
);
