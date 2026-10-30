// @vitest-environment node
import { eq, inArray, sql } from "drizzle-orm";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Magazine, MagazineIssue } from "@/payload-types";
import type { createCaller as CreateCaller } from "@/server/api/root";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import type * as Schema from "@/server/db/schema";
import type { Deps } from "@/server/magazines/deps";
import type * as Issues from "@/server/magazines/issue-service";
import { isLocalDbConfigured } from "@/test/magazine-auto-draft-fixture";

import type * as Stats from "./issue-stats";
import type * as Reads from "./reads";

vi.mock("@/server/email", () => ({ sendGatedEmail: vi.fn(async () => true) }));
describe.skipIf(!isLocalDbConfigured())(
  "issue numbers [DB integration]",
  { timeout: 60_000 },
  () => {
    let m: Deps & {
      schema: typeof Schema;
      stats: typeof Stats;
      reads: typeof Reads;
      issues: typeof Issues;
      createCaller: typeof CreateCaller;
    };
    let fx: {
      suffix: string;
      ownerId: string;
      memberId: string;
      outsiderId: string;
      userIds: string[];
      communityIds: string[];
      magazineIds: number[];
      articleIds: number[];
      issueNumber: number;
    };
    const now = new Date("2026-10-28T12:00:00Z");

    beforeAll(async () => {
      const [
        { db },
        schema,
        { getPayloadClient },
        stats,
        reads,
        issues,
        { createCaller },
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/payload"),
        import("./issue-stats"),
        import("./reads"),
        import("@/server/magazines/issue-service"),
        import("@/server/api/root"),
      ]);
      const { rows } = await db.execute<{ name: string }>(
        sql`select current_database() as name`,
      );
      if (rows[0]?.name !== "aitcom_test")
        throw new Error("Numbers tests require aitcom_test");
      m = {
        db,
        schema,
        payload: await getPayloadClient(),
        stats,
        reads,
        issues,
        createCaller,
      };
    }, 120_000);

    beforeEach(async () => {
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const ownerId = `reads-owner-${suffix}`;
      const memberId = `reads-member-${suffix}`;
      const outsiderId = `reads-outsider-${suffix}`;
      fx = {
        suffix,
        ownerId,
        memberId,
        outsiderId,
        userIds: [
          ownerId,
          memberId,
          outsiderId,
          ...["X", "Y", "Z", "W"].map((name) => `stats-${name}-${suffix}`),
        ],
        communityIds: [],
        magazineIds: [],
        articleIds: [],
        issueNumber: 0,
      };
      await m.db.insert(m.schema.user).values(
        fx.userIds.map((id) => ({
          id,
          name: id,
          email: `${id}@example.test`,
        })),
      );
      await m.db
        .insert(m.schema.memberProfiles)
        .values(fx.userIds.map((userId) => ({ userId, displayName: userId })));
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
        .where(inArray(s.activityEvents.actorId, fx.userIds));
      await db
        .delete(s.magazineStaff)
        .where(inArray(s.magazineStaff.userId, fx.userIds));
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
        .where(inArray(s.pointsEvents.userId, fx.userIds));
      await db
        .delete(s.notifications)
        .where(inArray(s.notifications.userId, fx.userIds));
      await db
        .delete(s.memberBadges)
        .where(inArray(s.memberBadges.userId, fx.userIds));
      await db
        .delete(s.memberProfiles)
        .where(inArray(s.memberProfiles.userId, fx.userIds));
      await db.delete(s.user).where(inArray(s.user.id, fx.userIds));
    }, 60_000);

    async function community(label: string, { listed = true } = {}) {
      const [row] = await m.db
        .insert(m.schema.communities)
        .values({
          name: label,
          slug: `reads-${label}-${fx.suffix}`,
          createdBy: fx.ownerId,
          isListedInDirectory: listed,
        })
        .returning();
      fx.communityIds.push(row!.id);
      await m.db.insert(m.schema.communityMemberships).values([
        { communityId: row!.id, userId: fx.ownerId, role: "owner" },
        { communityId: row!.id, userId: fx.memberId, role: "member" },
      ]);
      const magazine = await m.payload.create({
        collection: "magazines",
        data: {
          name: label,
          slug: `reads-${label}-${fx.suffix}`,
          communityId: row!.id,
          createdBy: fx.ownerId,
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
        data: {
          magazine: magazine.id,
          communityId: magazine.communityId,
          number: ++fx.issueNumber,
          title: "Reading issue",
          slug: `reads-${crypto.randomUUID()}`,
          status,
          visibility,
          publishedAt: status === "published" ? now.toISOString() : null,
        },
      });
    }

    async function articlesIn(
      magazine: Magazine,
      issue: MagazineIssue,
      communityRow: Awaited<ReturnType<typeof community>>["community"],
    ) {
      const ids: number[] = [];
      for (const label of ["one", "two", "unread"]) {
        const article = await m.payload.create({
          collection: "articles",
          draft: true,
          data: {
            title: label,
            slug: `reads-${label}-${crypto.randomUUID()}`,
            type: "article",
            content: plainTextToLexical("Read together"),
            authorId: fx.ownerId,
            authorName: "Ada",
            magazine: magazine.id,
            reviewStatus: "approved",
            status: "draft",
          },
        });
        ids.push(Number(article.id));
        fx.articleIds.push(Number(article.id));
      }
      await m.issues.setIssueItems(
        m,
        issue,
        ids.map((articleId) => ({ kind: "article" as const, articleId })),
        issue.updatedAt,
        { userId: fx.ownerId, community: communityRow },
      );
      await m.payload.update({
        collection: "articles",
        id: ids[0]!,
        locale: "nl",
        draft: false,
        data: {
          title: "Eerste artikel",
          content: plainTextToLexical("Samen lezen"),
        },
      });
      return ids;
    }

    const callerAs = (userId: string) =>
      m.createCaller({
        db: m.db,
        headers: new Headers(),
        session: { user: { id: userId, name: userId }, session: {} } as never,
      }).communities;

    it("counts views, readers, read to the end, subscribers and joins", async () => {
      const made = await community("numbers");
      const issue = await issueIn(made.magazine, "public");
      const otherIssue = await issueIn(made.magazine, "public");
      const [one, two, unread] = await articlesIn(
        made.magazine,
        issue,
        made.community,
      );
      // The issue order is deliberately different from creation/title order.
      const fresh = await m.payload.findByID({
        collection: "magazine-issues",
        id: issue.id,
      });
      await m.issues.setIssueItems(
        m,
        fresh,
        [two!, one!, unread!].map((articleId) => ({
          kind: "article" as const,
          articleId,
        })),
        fresh.updatedAt,
        { userId: fx.ownerId, community: made.community },
      );
      const read = (
        readerKey: string,
        articleId: number | null,
        event: "view" | "read_end" = "view",
      ) =>
        m.reads.recordMagazineRead(m.db, {
          magazineId: Number(made.magazine.id),
          issueId: Number(issue.id),
          articleId,
          readerKey,
          event,
          now,
        });
      await read("A", null);
      await read("A", null);
      await read("B", null);
      await read("A", one!);
      await read("A", one!, "read_end");
      await read("A", one!, "read_end");
      await read("B", one!);
      await read("A", two!);
      await m.reads.recordMagazineRead(m.db, {
        magazineId: Number(made.magazine.id),
        issueId: Number(otherIssue.id),
        articleId: null,
        readerKey: "other",
        event: "view",
        now,
      });
      await m.db.insert(m.schema.magazineSubscriptions).values([
        {
          magazineId: Number(made.magazine.id),
          sourceIssueId: Number(issue.id),
          email: `confirmed-${fx.suffix}@example.test`,
          confirmedAt: now,
        },
        {
          magazineId: Number(made.magazine.id),
          sourceIssueId: Number(issue.id),
          email: `pending-${fx.suffix}@example.test`,
        },
        {
          magazineId: Number(made.magazine.id),
          sourceIssueId: Number(otherIssue.id),
          email: `other-${fx.suffix}@example.test`,
          confirmedAt: now,
        },
      ]);
      const source = {
        via: "magazine" as const,
        magazineId: Number(made.magazine.id),
        issueId: Number(issue.id),
      };
      const [x, y, z, w] = ["X", "Y", "Z", "W"].map(
        (name) => `stats-${name}-${fx.suffix}`,
      ) as [string, string, string, string];
      const slug = made.community.slug;
      await callerAs(x).join({ slug, source });
      // Two matching join events still count as one person.
      await callerAs(x).leave({ slug });
      await callerAs(x).join({ slug, source });
      await callerAs(w).join({
        slug,
        source: { ...source, issueId: Number(otherIssue.id) },
      });
      await m.db
        .update(m.schema.communities)
        .set({ joinPolicy: "approval_required" })
        .where(eq(m.schema.communities.id, made.community.id));
      await callerAs(y).requestToJoin({ slug, source });
      await callerAs(fx.ownerId).approveRequest({ slug, userId: y });
      await callerAs(z).requestToJoin({ slug, source });

      const execute = vi.spyOn(m.db, "execute");
      const select = vi.spyOn(m.db, "select");
      const find = vi.spyOn(m.payload, "find");
      const findByID = vi.spyOn(m.payload, "findByID");
      try {
        expect(await m.stats.loadIssueStats(m, Number(issue.id), "nl")).toEqual(
          {
            issue: {
              id: Number(issue.id),
              number: 1,
              title: "Reading issue",
              publishedAt: now.toISOString(),
              status: "published",
            },
            views: 3,
            readers: 2,
            newSubscribers: 1,
            joins: 2,
            articles: [
              { articleId: two, title: "two", readers: 1, readToEnd: 0 },
              {
                articleId: one,
                title: "Eerste artikel",
                readers: 2,
                readToEnd: 1,
              },
              { articleId: unread, title: "unread", readers: 0, readToEnd: 0 },
            ],
          },
        );
        expect(
          execute.mock.calls.length +
            select.mock.calls.length +
            // Payload batches relationship population internally; count only
            // the loader's own calls to its Local API boundary.
            find.mock.calls.filter(([options]) => !options.currentDepth)
              .length +
            findByID.mock.calls.length,
        ).toBeLessThanOrEqual(4);
        expect(
          find.mock.calls.filter(([options]) => !options.currentDepth),
        ).toEqual([]);
        expect(findByID).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            collection: "magazine-issues",
            id: Number(issue.id),
            locale: "nl",
            draft: false,
            depth: 1,
            disableErrors: true,
            select: {
              number: true,
              title: true,
              publishedAt: true,
              status: true,
              magazine: true,
              communityId: true,
              items: { article: { article: true } },
            },
            populate: expect.objectContaining({ articles: { title: true } }),
          }),
        );
      } finally {
        execute.mockRestore();
        select.mockRestore();
        find.mockRestore();
        findByID.mockRestore();
      }
    });

    it("keeps unread articles, counts readers across all pages and returns null for a missing issue", async () => {
      const made = await community("empty");
      const issue = await issueIn(made.magazine, "public");
      const [one, two, unread] = await articlesIn(
        made.magazine,
        issue,
        made.community,
      );
      const empty = await m.stats.loadIssueStats(m, Number(issue.id), "en");
      expect(empty).toMatchObject({
        views: 0,
        readers: 0,
        newSubscribers: 0,
        joins: 0,
        articles: [
          { articleId: one, title: "one", readers: 0, readToEnd: 0 },
          { articleId: two, title: "two", readers: 0, readToEnd: 0 },
          { articleId: unread, title: "unread", readers: 0, readToEnd: 0 },
        ],
      });
      // Neither reader ever opened the issue page; one appears in two articles.
      for (const [readerKey, articleId, event] of [
        ["article-only", one!, "read_end"],
        ["article-only", two!, "view"],
        ["second", two!, "view"],
      ] as const) {
        await m.reads.recordMagazineRead(m.db, {
          magazineId: Number(made.magazine.id),
          issueId: Number(issue.id),
          articleId,
          readerKey,
          event,
          now,
        });
      }
      expect(
        await m.stats.loadIssueStats(m, Number(issue.id), "en"),
      ).toMatchObject({
        views: 0,
        readers: 2,
        articles: [
          { articleId: one, readers: 1, readToEnd: 1 },
          { articleId: two, readers: 2, readToEnd: 0 },
          { articleId: unread, readers: 0, readToEnd: 0 },
        ],
      });
      expect(await m.stats.loadIssueStats(m, 2_147_483_647, "en")).toBeNull();
    });
  },
);
