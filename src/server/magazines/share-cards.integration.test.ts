// @vitest-environment node
import { inArray, sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Magazine, MagazineIssue } from "@/payload-types";
import type * as Schema from "@/server/db/schema";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import { isLocalDbConfigured } from "@/test/magazine-auto-draft-fixture";
import type { Deps } from "./deps";
import type * as Cards from "./share-cards";
import type * as Issues from "./issue-service";

describe.skipIf(!isLocalDbConfigured())(
  "magazine share cards [DB integration]",
  () => {
    let m: Deps & {
      schema: typeof Schema;
      cards: typeof Cards;
      issues: typeof Issues;
    };
    let fx: {
      suffix: string;
      userId: string;
      communityIds: string[];
      magazineIds: number[];
      articleIds: number[];
    };

    beforeAll(async () => {
      const [{ db }, schema, { getPayloadClient }, cards, issues] =
        await Promise.all([
          import("@/server/db"),
          import("@/server/db/schema"),
          import("@/server/payload"),
          import("./share-cards"),
          import("./issue-service"),
        ]);
      const { rows } = await db.execute<{ name: string }>(
        sql`select current_database() as name`,
      );
      if (rows[0]?.name !== "aitcom_test")
        throw new Error("Share card tests require aitcom_test");
      m = { db, schema, payload: await getPayloadClient(), cards, issues };
    }, 120_000);

    beforeEach(async () => {
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      fx = {
        suffix,
        userId: `share-${suffix}`,
        communityIds: [],
        magazineIds: [],
        articleIds: [],
      };
      await m.db.insert(m.schema.user).values({
        id: fx.userId,
        name: "Ada",
        email: `${fx.userId}@example.test`,
      });
      await m.db
        .insert(m.schema.memberProfiles)
        .values({ userId: fx.userId, displayName: "Ada" });
    });

    afterEach(async () => {
      if (!fx || !m) return;
      const { db, payload, schema: s } = m;
      if (fx.magazineIds.length) {
        await db
          .delete(s.magazineReads)
          .where(inArray(s.magazineReads.magazineId, fx.magazineIds));
        await db
          .delete(s.magazineSubscriptions)
          .where(inArray(s.magazineSubscriptions.magazineId, fx.magazineIds));
        await payload.delete({
          collection: "magazine-issues",
          where: { magazine: { in: fx.magazineIds } },
        });
      }
      if (fx.articleIds.length)
        await payload.delete({
          collection: "articles",
          where: { id: { in: fx.articleIds } },
        });
      if (fx.magazineIds.length)
        await payload.delete({
          collection: "magazines",
          where: { id: { in: fx.magazineIds } },
        });
      await db
        .delete(s.activityEvents)
        .where(inArray(s.activityEvents.actorId, [fx.userId]));
      await db
        .delete(s.magazineStaff)
        .where(inArray(s.magazineStaff.userId, [fx.userId]));
      if (fx.communityIds.length) {
        await db
          .delete(s.spaces)
          .where(inArray(s.spaces.communityId, fx.communityIds));
        await db
          .delete(s.communityMemberships)
          .where(inArray(s.communityMemberships.communityId, fx.communityIds));
        await db
          .delete(s.communities)
          .where(inArray(s.communities.id, fx.communityIds));
      }
      await db
        .delete(s.pointsEvents)
        .where(inArray(s.pointsEvents.userId, [fx.userId]));
      await db
        .delete(s.notifications)
        .where(inArray(s.notifications.userId, [fx.userId]));
      await db
        .delete(s.memberBadges)
        .where(inArray(s.memberBadges.userId, [fx.userId]));
      await db
        .delete(s.memberProfiles)
        .where(inArray(s.memberProfiles.userId, [fx.userId]));
      await db.delete(s.user).where(inArray(s.user.id, [fx.userId]));
    }, 60_000);

    async function community(label: string, { listed = true } = {}) {
      const [row] = await m.db
        .insert(m.schema.communities)
        .values({
          name: `Share ${label}`,
          slug: `share-${label}-${fx.suffix}`,
          createdBy: fx.userId,
          isListedInDirectory: listed,
        })
        .returning();
      fx.communityIds.push(row!.id);
      await m.db
        .insert(m.schema.communityMemberships)
        .values({ communityId: row!.id, userId: fx.userId, role: "owner" });
      const magazine = await m.payload.create({
        collection: "magazines",
        data: {
          name: `Weekly ${label}`,
          slug: `share-${label}-${fx.suffix}`,
          communityId: row!.id,
          createdBy: fx.userId,
        },
      });
      fx.magazineIds.push(Number(magazine.id));
      return { community: row!, magazine };
    }

    async function issueIn(
      magazine: Magazine,
      visibility: MagazineIssue["visibility"],
      status: MagazineIssue["status"] = "published",
    ) {
      return m.payload.create({
        collection: "magazine-issues",
        locale: "en",
        data: {
          magazine: magazine.id,
          communityId: magazine.communityId,
          number: 4,
          title: "The tools issue",
          slug: `tools-${fx.magazineIds.length}-${fx.suffix}`,
          visibility,
          status,
          publishedAt: status === "published" ? new Date().toISOString() : null,
          coverImageUrl: "https://example.test/cover.png",
        },
      });
    }

    async function articleIn(
      magazine: Magazine,
      issue: MagazineIssue | null,
      status: "published" | "draft" = "published",
    ) {
      const article = await m.payload.create({
        collection: "articles",
        draft: true,
        locale: "en",
        data: {
          title: "Agents & us",
          slug: `share-article-${fx.articleIds.length}-${fx.suffix}`,
          type: "article",
          content: plainTextToLexical("Members read the rest."),
          authorId: fx.userId,
          authorName: "Ada",
          magazine: magazine.id,
          reviewStatus: "approved",
          status: "draft",
        },
      });
      fx.articleIds.push(Number(article.id));
      if (issue) {
        const community = (await m.db.query.communities.findFirst({
          where: (c, { eq }) => eq(c.id, magazine.communityId),
        }))!;
        await m.issues.setIssueItems(
          m,
          issue,
          [{ kind: "article", articleId: Number(article.id) }],
          issue.updatedAt,
          { userId: fx.userId, community },
        );
      }
      await m.payload.update({
        collection: "articles",
        id: article.id,
        draft: false,
        data: { status },
      });
      return article;
    }

    const load = (
      magazine: Magazine,
      issue: MagazineIssue,
      articleSlug: string | null = null,
    ) =>
      m.cards.loadShareCard(m, {
        magazineSlug: magazine.slug,
        issueSlug: issue.slug,
        articleSlug,
        locale: "en",
      });

    it("gives a card for a public and a preview issue and its articles", async () => {
      for (const visibility of ["public", "teaser"] as const) {
        const { magazine } = await community(visibility);
        const issue = await issueIn(magazine, visibility);
        const article = await articleIn(magazine, issue);
        const expected = {
          magazineName: magazine.name,
          communityName: `Share ${visibility}`,
          issueNumber: 4,
          issueTitle: "The tools issue",
          coverImageUrl: "https://example.test/cover.png",
          article: null,
        };
        expect(await load(magazine, issue)).toEqual(expected);
        expect(await load(magazine, issue, article.slug)).toEqual({
          ...expected,
          article: { title: "Agents & us", authorName: "Ada" },
        });
      }
    });

    it("share image is 404 for a members-only or unconfirmed issue", async () => {
      for (const [label, visibility, listed, status] of [
        ["members", "members", true, "published"],
        ["unconfirmed", "teaser", false, "published"],
        ["draft", "public", true, "draft"],
      ] as const) {
        const { magazine } = await community(label, { listed });
        const issue = await issueIn(magazine, visibility, status);
        expect(await load(magazine, issue)).toBeNull();
      }
      const { magazine } = await community("article-gates");
      const issue = await issueIn(magazine, "public");
      const outside = await articleIn(magazine, null);
      expect(await load(magazine, issue, outside.slug)).toBeNull();
      const unpublished = await articleIn(magazine, issue, "draft");
      expect(await load(magazine, issue, unpublished.slug)).toBeNull();
    });

    it("switching to members takes the share image down at once", async () => {
      const { magazine } = await community("takedown");
      const issue = await issueIn(magazine, "public");
      const article = await articleIn(magazine, issue);
      expect(await load(magazine, issue)).not.toBeNull();
      expect(await load(magazine, issue, article.slug)).not.toBeNull();
      await m.payload.update({
        collection: "magazine-issues",
        id: issue.id,
        data: { visibility: "members" },
      });
      expect(await load(magazine, issue)).toBeNull();
      expect(await load(magazine, issue, article.slug)).toBeNull();
    });
  },
);
