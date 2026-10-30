// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { createCaller as CreateCaller } from "@/server/api/root";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type { PayloadClient } from "@/server/magazines/deps";

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
  "blog article writes [DB integration]",
  { timeout: 30_000 },
  () => {
    let m: {
      db: typeof Db;
      schema: typeof Schema;
      createCaller: typeof CreateCaller;
      payload: PayloadClient;
    };
    let fx: { userId: string; articleId: number };

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
      const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const userId = `blog-writer-${sfx}`;
      await m.db.insert(m.schema.user).values({
        id: userId,
        email: `${userId}@example.test`,
        name: userId,
      });
      await m.db.insert(m.schema.memberProfiles).values({
        userId,
        displayName: userId,
        xp: 0,
      });
      fx = { userId, articleId: 0 };
      const article = await caller().articles.create({
        title: "Original blog story",
        slug: `blog-story-${sfx}`,
        content: richText("Original blog text"),
        type: "article",
      });
      fx.articleId = article.id;
    }, 60_000);

    afterEach(async () => {
      if (!fx) return;
      const { db, schema, payload } = m;
      await payload.delete({
        collection: "articles",
        where: { authorId: { equals: fx.userId } },
      });
      await db
        .delete(schema.magazineStaff)
        .where(eq(schema.magazineStaff.userId, fx.userId));
      await db
        .delete(schema.notifications)
        .where(eq(schema.notifications.userId, fx.userId));
      await db
        .delete(schema.pointsEvents)
        .where(eq(schema.pointsEvents.userId, fx.userId));
      await db
        .delete(schema.activityEvents)
        .where(eq(schema.activityEvents.actorId, fx.userId));
      await db
        .delete(schema.memberBadges)
        .where(eq(schema.memberBadges.userId, fx.userId));
      await db
        .delete(schema.memberProfiles)
        .where(eq(schema.memberProfiles.userId, fx.userId));
      await db.delete(schema.user).where(eq(schema.user.id, fx.userId));
    }, 60_000);

    function caller() {
      return m.createCaller({
        db: m.db,
        headers: new Headers(),
        session: {
          user: { id: fx.userId, name: fx.userId },
          session: {},
        } as never,
      });
    }

    function latest() {
      return m.payload.findByID({
        collection: "articles",
        id: fx.articleId,
        draft: true,
        depth: 0,
      });
    }

    function publish() {
      return m.payload.update({
        collection: "articles",
        id: fx.articleId,
        data: { status: "published", publishedAt: new Date().toISOString() },
      });
    }

    it("refuses a non-trusted author's update to a published blog article", async () => {
      await publish();
      await expect(
        caller().articles.update({ id: fx.articleId, title: "Changed story" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await latest()).toMatchObject({
        title: "Original blog story",
        status: "published",
        magazine: null,
      });
    });

    it("clears the review status and note when the writer saves requested changes", async () => {
      await m.payload.update({
        collection: "articles",
        id: fx.articleId,
        data: {
          reviewStatus: "changes_requested",
          reviewNote: "Please explain the example.",
        },
      });
      expect(await latest()).toMatchObject({
        reviewStatus: "changes_requested",
        reviewNote: "Please explain the example.",
      });
      await expect(
        caller().articles.update({
          id: fx.articleId,
          title: "Revised blog story",
        }),
      ).resolves.toMatchObject({ reviewStatus: null, reviewNote: null });
      expect(await latest()).toMatchObject({
        title: "Revised blog story",
        reviewStatus: null,
        reviewNote: null,
        magazine: null,
      });
    });

    it("refuses deletion of a published blog article", async () => {
      await publish();
      await expect(
        caller().articles.delete({ id: fx.articleId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await latest()).toMatchObject({
        id: fx.articleId,
        status: "published",
        magazine: null,
      });
    });
  },
);
