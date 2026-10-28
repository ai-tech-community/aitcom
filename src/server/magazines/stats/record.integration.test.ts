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
import type * as Env from "@/env";
import type { createCaller as CreateCaller } from "@/server/api/root";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import type * as Schema from "@/server/db/schema";
import type { Deps } from "@/server/magazines/deps";
import type * as Issues from "@/server/magazines/issue-service";
import { isLocalDbConfigured } from "@/test/magazine-auto-draft-fixture";

import type * as Record from "./record";
import type * as Reads from "./reads";

vi.mock("@/server/email", () => ({ sendGatedEmail: vi.fn(async () => true) }));
vi.mock("@/env", async (original) => {
  const { env } = await original<typeof Env>();
  return {
    env: {
      ...env,
      get BETTER_AUTH_SECRET() {
        return process.env.BETTER_AUTH_SECRET;
      },
    },
  };
});

describe.skipIf(!isLocalDbConfigured())(
  "magazine reads [DB integration]",
  { timeout: 60_000 },
  () => {
    let m: Deps & {
      schema: typeof Schema;
      record: typeof Record;
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
    const later = new Date("2026-10-28T12:01:00Z");

    beforeAll(async () => {
      const [
        { db },
        schema,
        { getPayloadClient },
        record,
        reads,
        issues,
        { createCaller },
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/payload"),
        import("./record"),
        import("./reads"),
        import("@/server/magazines/issue-service"),
        import("@/server/api/root"),
      ]);
      const { rows } = await db.execute<{ name: string }>(
        sql`select current_database() as name`,
      );
      if (rows[0]?.name !== "aitcom_test")
        throw new Error("Read tests require aitcom_test");
      m = {
        db,
        schema,
        payload: await getPayloadClient(),
        record,
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
        userIds: [ownerId, memberId, outsiderId],
        communityIds: [],
        magazineIds: [],
        articleIds: [],
        issueNumber: 0,
      };
      vi.stubEnv("BETTER_AUTH_SECRET", "magazine-reads-test-secret");
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
      vi.unstubAllEnvs();
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
      for (const label of ["one", "two"]) {
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
      return ids;
    }

    const rows = (issueId: number) =>
      m.db
        .select()
        .from(m.schema.magazineReads)
        .where(eq(m.schema.magazineReads.issueId, issueId));
    const callerAs = (viewerId: string | null, ip = `reads-${fx.suffix}`) =>
      m.createCaller({
        db: m.db,
        headers: new Headers({
          "x-forwarded-for": `${ip}, proxy`,
          "user-agent": "Magazine test browser",
        }),
        session: viewerId
          ? ({ user: { id: viewerId, name: viewerId }, session: {} } as never)
          : null,
      }).magazineStats;

    it("record re-checks access and never trusts the client", async () => {
      const made = await community("public");
      const issue = await issueIn(made.magazine, "public");
      const [articleId, secondArticleId] = await articlesIn(
        made.magazine,
        issue,
        made.community,
      );
      const input = {
        issueId: Number(issue.id),
        articleId: null,
        event: "view" as const,
        viewerId: fx.outsiderId,
        readerKey: "outsider-key",
        now,
      };
      for (let i = 0; i < 10; i++)
        expect(
          await m.record.recordReadFor(m, { ...input, now: i ? later : now }),
        ).toBe(true);
      expect(await rows(issue.id)).toEqual([
        expect.objectContaining({
          views: 10,
          firstSeenAt: now,
          lastSeenAt: later,
          articleId: null,
        }),
      ]);
      expect(
        await m.record.recordReadFor(m, {
          ...input,
          viewerId: fx.ownerId,
          readerKey: "editor-key",
        }),
      ).toBe(false);
      expect(
        await m.record.recordReadFor(m, { ...input, issueId: 2_147_483_647 }),
      ).toBe(false);
      const privateIssue = await issueIn(made.magazine, "members");
      expect(
        await m.record.recordReadFor(m, { ...input, issueId: privateIssue.id }),
      ).toBe(false);
      const preview = await issueIn(made.magazine, "teaser");
      const [previewArticleId] = await articlesIn(
        made.magazine,
        preview,
        made.community,
      );
      expect(
        await m.record.recordReadFor(m, {
          ...input,
          issueId: preview.id,
          articleId: previewArticleId!,
          event: "read_end",
        }),
      ).toBe(false);
      expect(
        await m.record.recordReadFor(m, { ...input, issueId: preview.id }),
      ).toBe(true);
      expect(
        await m.record.recordReadFor(m, {
          ...input,
          issueId: preview.id,
          articleId: previewArticleId!,
        }),
      ).toBe(true);
      for (const row of await rows(preview.id))
        expect(row).toMatchObject({ views: 1, readToEndAt: null });
      expect(
        await m.record.recordReadFor(m, {
          ...input,
          issueId: privateIssue.id,
          articleId: articleId!,
          viewerId: fx.memberId,
        }),
      ).toBe(false);
      expect(
        await m.record.recordReadFor(m, { ...input, event: "read_end" }),
      ).toBe(false);
      const draft = await issueIn(made.magazine, "public", "draft");
      expect(
        await m.record.recordReadFor(m, { ...input, issueId: draft.id }),
      ).toBe(false);
      expect(
        await m.record.recordReadFor(m, { ...input, articleId: 2_147_483_647 }),
      ).toBe(false);
      await m.payload.update({
        collection: "articles",
        id: secondArticleId!,
        draft: false,
        data: { status: "draft" },
      });
      expect(
        await m.record.recordReadFor(m, {
          ...input,
          articleId: secondArticleId!,
        }),
      ).toBe(false);
      const end = {
        ...input,
        articleId: articleId!,
        viewerId: fx.memberId,
        readerKey: "member-key",
        event: "read_end" as const,
      };
      expect(await m.record.recordReadFor(m, end)).toBe(true);
      expect(await m.record.recordReadFor(m, { ...end, now: later })).toBe(
        true,
      );
      expect(await rows(issue.id)).toHaveLength(2);
      expect(
        (await rows(issue.id)).find((r) => r.articleId === articleId),
      ).toMatchObject({ views: 0, readToEndAt: now });
      expect(
        await m.record.recordReadFor(m, { ...end, event: "view", now: later }),
      ).toBe(true);
      expect(
        (await rows(issue.id)).find((r) => r.articleId === articleId),
      ).toMatchObject({
        views: 1,
        firstSeenAt: now,
        lastSeenAt: later,
        readToEndAt: now,
      });
      expect(await rows(privateIssue.id)).toEqual([]);
    });

    it("upserts both partial indexes without losing concurrent views", async () => {
      const made = await community("parallel");
      const issue = await issueIn(made.magazine, "public");
      const [articleId] = await articlesIn(
        made.magazine,
        issue,
        made.community,
      );
      for (const target of [null, articleId!]) {
        await Promise.all(
          Array.from({ length: 10 }, () =>
            m.reads.recordMagazineRead(m.db, {
              magazineId: Number(made.magazine.id),
              issueId: Number(issue.id),
              articleId: target,
              readerKey: "parallel-key",
              event: "view",
              now,
            }),
          ),
        );
      }
      expect(await rows(issue.id)).toHaveLength(2);
      for (const row of await rows(issue.id)) expect(row.views).toBe(10);
    });

    it("the router derives reader keys and quietly refuses requests over the rate limit", async () => {
      const made = await community("router");
      const issue = await issueIn(made.magazine, "public");
      const input = { issueId: Number(issue.id), event: "view" as const };
      const guest = callerAs(null);
      const results = await Promise.all(
        Array.from({ length: 120 }, () => guest.record(input)),
      );
      expect(results.every((result) => result.recorded)).toBe(true);
      await expect(guest.record(input)).resolves.toEqual({ recorded: false });
      // The same first forwarded IP shares the limit across accounts.
      await expect(callerAs(fx.memberId).record(input)).resolves.toEqual({
        recorded: false,
      });
      expect(await rows(issue.id)).toEqual([
        expect.objectContaining({
          views: 120,
          readerKey: expect.stringMatching(/^a[a-f0-9]{32}$/),
        }),
      ]);
      await expect(
        callerAs(fx.memberId, `member-${fx.suffix}`).record(input),
      ).resolves.toEqual({ recorded: true });
      expect(
        (await rows(issue.id)).some((row) =>
          /^u[a-f0-9]{32}$/.test(row.readerKey),
        ),
      ).toBe(true);
    });

    it("the router records nothing when the secret is missing", async () => {
      const made = await community("no-secret");
      const issue = await issueIn(made.magazine, "public");
      vi.stubEnv("BETTER_AUTH_SECRET", "  ");
      await expect(
        callerAs(null).record({ issueId: Number(issue.id), event: "view" }),
      ).resolves.toEqual({ recorded: false });
      expect(await rows(issue.id)).toEqual([]);
    });
  },
);
