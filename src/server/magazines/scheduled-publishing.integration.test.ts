// @vitest-environment node
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { issueBuilderPath } from "@/lib/magazines/paths";
import type { Magazine, MagazineIssue } from "@/payload-types";
import type { createCaller as CreateCaller } from "@/server/api/root";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { Deps } from "./deps";
import type * as IssueService from "./issue-service";
import type * as ScheduledPublishing from "./scheduled-publishing";
import type * as IssueJobs from "./issue-jobs";

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

const baseTime = new Date("2026-10-27T12:00:00Z");
const at = (minutes: number) => new Date(baseTime.getTime() + minutes * 60_000);
const richText = (text: string) => ({
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
});

describe.skipIf(!isLocalDbConfigured())(
  "scheduled magazine publishing [DB integration]",
  { timeout: 30_000 },
  () => {
    let m: Deps & {
      db: typeof Db;
      schema: typeof Schema;
      issues: typeof IssueService;
      scheduled: typeof ScheduledPublishing;
      jobs: typeof IssueJobs;
      createCaller: typeof CreateCaller;
    };
    let fx: {
      sfx: string;
      ownerId: string;
      adminId: string;
      editorId: string;
      memberId: string;
      community: { id: string; slug: string; isListedInDirectory: boolean };
      magazine: Magazine;
    };

    beforeAll(async () => {
      const [
        { db },
        schema,
        issues,
        scheduled,
        jobs,
        { createCaller },
        { getPayloadClient },
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("./issue-service"),
        import("./scheduled-publishing"),
        import("./issue-jobs"),
        import("@/server/api/root"),
        import("@/server/payload"),
      ]);
      m = {
        db,
        schema,
        issues,
        scheduled,
        jobs,
        createCaller,
        payload: await getPayloadClient(),
      };
    }, 120_000);

    beforeEach(async () => {
      const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const ids = {
        ownerId: `sch-owner-${sfx}`,
        adminId: `sch-admin-${sfx}`,
        editorId: `sch-editor-${sfx}`,
        memberId: `sch-member-${sfx}`,
      };
      await m.db.insert(m.schema.user).values(
        Object.values(ids).map((id) => ({
          id,
          name: id,
          email: `${id}@example.test`,
        })),
      );
      await m.db
        .insert(m.schema.memberProfiles)
        .values(
          Object.values(ids).map((userId) => ({ userId, displayName: userId })),
        );
      const [community] = await m.db
        .insert(m.schema.communities)
        .values({
          name: `Scheduled ${sfx}`,
          slug: `sch-${sfx}`,
          createdBy: ids.ownerId,
          isListedInDirectory: true,
        })
        .returning();
      await m.db.insert(m.schema.communityMemberships).values([
        { communityId: community!.id, userId: ids.ownerId, role: "owner" },
        { communityId: community!.id, userId: ids.adminId, role: "admin" },
        { communityId: community!.id, userId: ids.editorId, role: "member" },
        { communityId: community!.id, userId: ids.memberId, role: "member" },
      ]);
      const { saveMagazineSettings } = await import("./magazine-service");
      const magazine = await saveMagazineSettings(
        m,
        community!,
        {
          name: "The Gazette",
          slug: `sch-${sfx}`,
          topics: [],
          defaultVisibility: "members",
        },
        ids.ownerId,
        true,
      );
      await m.db.insert(m.schema.magazineStaff).values({
        magazineId: magazine.id,
        communityId: community!.id,
        userId: ids.editorId,
        role: "editor",
        assignedBy: ids.ownerId,
      });
      fx = { sfx, ...ids, community: community!, magazine };
    }, 60_000);

    afterEach(async () => {
      vi.restoreAllMocks();
      if (!fx) return;
      const { db, payload, schema: s } = m;
      const userIds = [fx.ownerId, fx.adminId, fx.editorId, fx.memberId];
      await db
        .delete(s.magazineSubscriptions)
        .where(eq(s.magazineSubscriptions.magazineId, fx.magazine.id));
      await payload.delete({
        collection: "magazine-issues",
        where: { magazine: { equals: fx.magazine.id } },
      });
      await payload.delete({
        collection: "articles",
        where: { authorId: { in: userIds } },
      });
      await payload.delete({ collection: "magazines", id: fx.magazine.id });
      await db
        .delete(s.magazineStaff)
        .where(inArray(s.magazineStaff.userId, userIds));
      await db
        .delete(s.spaces)
        .where(eq(s.spaces.communityId, fx.community.id));
      await db
        .delete(s.communityMemberships)
        .where(inArray(s.communityMemberships.userId, userIds));
      await db
        .delete(s.communities)
        .where(eq(s.communities.id, fx.community.id));
      await db
        .delete(s.pointsEvents)
        .where(inArray(s.pointsEvents.userId, userIds));
      await db
        .delete(s.activityEvents)
        .where(inArray(s.activityEvents.actorId, userIds));
      await db
        .delete(s.notifications)
        .where(inArray(s.notifications.userId, userIds));
      await db
        .delete(s.memberBadges)
        .where(inArray(s.memberBadges.userId, userIds));
      await db
        .delete(s.memberProfiles)
        .where(inArray(s.memberProfiles.userId, userIds));
      await db.delete(s.user).where(inArray(s.user.id, userIds));
    }, 60_000);

    function callerAs(userId: string) {
      return m.createCaller({
        db: m.db,
        headers: new Headers(),
        session: { user: { id: userId, name: userId }, session: {} } as never,
      });
    }
    const actor = () => ({ userId: fx.editorId, community: fx.community });
    const run = (minutes: number) =>
      m.scheduled.publishDueIssues(m, at(minutes));
    const load = (id: number) =>
      m.payload.findByID({ collection: "magazine-issues", id, depth: 0 });

    async function scheduledIssue(
      label = "Autumn",
      minutes = 60,
      via?: "auto",
    ) {
      const editor = callerAs(fx.editorId);
      const article = await editor.articles.create({
        title: label,
        slug: `sch-${label.toLowerCase()}-${fx.sfx}`,
        content: richText(label),
        type: "article",
        magazineId: fx.magazine.id,
      });
      await editor.articles.submit({ id: article.id });
      const issue = await m.issues.createIssue(
        m,
        fx.magazine,
        { title: label },
        actor(),
      );
      const { issue: filled } = await m.issues.setIssueItems(
        m,
        issue,
        [{ kind: "article", articleId: article.id }],
        issue.updatedAt,
        actor(),
      );
      return {
        issue: await m.issues.scheduleIssue(
          m,
          filled,
          at(minutes),
          filled.updatedAt,
          actor(),
          baseTime,
          via ? { via } : undefined,
        ),
        articleId: article.id,
      };
    }
    async function empty(issue: MagazineIssue) {
      return (
        await m.issues.setIssueItems(m, issue, [], issue.updatedAt, actor())
      ).issue;
    }
    const notices = () =>
      m.db
        .select()
        .from(m.schema.notifications)
        .where(
          and(
            eq(m.schema.notifications.communityId, fx.community.id),
            eq(m.schema.notifications.type, "magazine_issue_schedule_failed"),
          ),
        );
    async function expectNotices(
      issueId: number,
      reason: string,
      editorIds = [fx.ownerId, fx.adminId, fx.editorId],
    ) {
      const rows = await notices();
      expect(rows.map((row) => row.userId).sort()).toEqual(
        [...editorIds].sort(),
      );
      for (const row of rows)
        expect(row.metadata).toMatchObject({
          reason,
          issueId,
          reviewPath: issueBuilderPath(fx.community.slug, issueId),
        });
    }
    async function expectOnce(issueId: number, articleId: number) {
      expect(
        await m.db
          .select()
          .from(m.schema.magazineIssueAnnouncements)
          .where(eq(m.schema.magazineIssueAnnouncements.issueId, issueId)),
      ).toHaveLength(1);
      expect(
        await m.db
          .select()
          .from(m.schema.magazineArticleCredits)
          .where(eq(m.schema.magazineArticleCredits.articleId, articleId)),
      ).toHaveLength(1);
    }

    const history = async () =>
      (await import("./issue-history")).listIssueHistory(m.db, fx.magazine.id);

    it("publishes an automatic schedule as automatic", async () => {
      await m.db.insert(m.schema.magazineAutoDraftSettings).values({
        magazineId: fx.magazine.id,
        whenReady: "auto_publish",
      });
      const { issue } = await scheduledIssue("Automatic", 60, "auto");
      expect(await run(65)).toEqual({ published: 1, failed: 0, retried: 0 });
      expect(await load(issue.id)).toMatchObject({
        status: "published",
        publishedVia: "auto",
        scheduledVia: null,
      });
      expect((await history())[0]).toMatchObject({
        detail: { event: "published", origin: "auto" },
        actorName: null,
      });
    });

    it("switching settings off auto-publish fails the automatic schedule", async () => {
      const { issue } = await scheduledIssue("Automatic", 60, "auto");
      await m.db.insert(m.schema.magazineAutoDraftSettings).values({
        magazineId: fx.magazine.id,
        whenReady: "notify",
      });
      expect(await run(65)).toEqual({ published: 0, failed: 1, retried: 0 });
      expect(await load(issue.id)).toMatchObject({
        status: "draft",
        scheduledFor: null,
        scheduledBy: null,
        scheduledVia: null,
      });
      await expectNotices(issue.id, "auto_off");
      expect((await history())[0]).toMatchObject({
        detail: {
          event: "auto_publish_stopped",
          why: "failed",
          failure: "auto_off",
        },
        actorName: null,
      });
    });

    it("an automatic schedule still needs the person's edit rights", async () => {
      await m.db.insert(m.schema.magazineAutoDraftSettings).values({
        magazineId: fx.magazine.id,
        whenReady: "auto_publish",
      });
      const { issue } = await scheduledIssue("Automatic", 60, "auto");
      await m.db.execute(
        sql`UPDATE "public"."magazine_issues" SET "scheduled_by" = ${fx.editorId} WHERE "id" = ${issue.id}`,
      );
      await m.db
        .delete(m.schema.magazineStaff)
        .where(eq(m.schema.magazineStaff.userId, fx.editorId));
      expect((await run(65)).failed).toBe(1);
      expect((await load(issue.id)).status).toBe("draft");
      await expectNotices(issue.id, "no_rights", [fx.ownerId, fx.adminId]);
      expect((await history())[0]).toMatchObject({
        detail: {
          event: "auto_publish_stopped",
          why: "failed",
          failure: "no_rights",
        },
        actorName: null,
      });
      // Losing rights wins even when the settings would also refuse publication.
      const draft = await load(issue.id);
      await m.issues.scheduleIssue(
        m,
        draft,
        at(120),
        draft.updatedAt,
        actor(),
        at(65),
        { via: "auto" },
      );
      await m.db
        .update(m.schema.magazineAutoDraftSettings)
        .set({ whenReady: "notify" })
        .where(
          eq(m.schema.magazineAutoDraftSettings.magazineId, fx.magazine.id),
        );
      expect((await run(125)).failed).toBe(1);
      expect((await history())[0]).toMatchObject({
        detail: { failure: "no_rights" },
      });
    });

    it("an automatic schedule without settings stays a draft", async () => {
      const { issue } = await scheduledIssue("Automatic", 60, "auto");
      expect(await run(65)).toEqual({ published: 0, failed: 1, retried: 0 });
      expect((await load(issue.id)).status).toBe("draft");
      await expectNotices(issue.id, "auto_off");
    });

    it("publishes a due issue once, as the person who scheduled it", async () => {
      const { issue, articleId } = await scheduledIssue();
      expect(await run(30)).toEqual({ published: 0, failed: 0, retried: 0 });
      // Exercise the real job runner as well as the scheduled-publishing seam.
      expect(
        await m.jobs.runMagazineIssueJobs(m, {
          now: at(120),
          mailer: {
            send: vi.fn(async () => true),
            recipient: (to) => to,
            sleep: async () => undefined,
          },
        }),
      ).toEqual({
        published: 1,
        failed: 0,
        retried: 0,
        inbox: 0,
        email: 0,
        completed: 1,
        drafted: 0,
        skipped: 0,
        purged: 0,
      });
      expect(await load(issue.id)).toMatchObject({
        status: "published",
        publishedBy: fx.editorId,
        publishedVia: "schedule",
        publishedAt: at(120).toISOString(),
        scheduledFor: null,
        scheduledBy: null,
      });
      expect(
        await m.payload.findByID({
          collection: "articles",
          id: articleId,
          depth: 0,
        }),
      ).toMatchObject({ status: "published", authorId: fx.editorId });
      await expectOnce(issue.id, articleId);
      expect(await run(120)).toEqual({ published: 0, failed: 0, retried: 0 });
      await expectOnce(issue.id, articleId);
    });

    it("two runs at once publish it once", async () => {
      const { issue, articleId } = await scheduledIssue();
      const results = await Promise.all([run(120), run(120)]);
      expect(results.reduce((sum, result) => sum + result.published, 0)).toBe(
        1,
      );
      expect((await load(issue.id)).status).toBe("published");
      await expectOnce(issue.id, articleId);
    });

    it("a rescheduled issue is not published early", async () => {
      const { issue } = await scheduledIssue();
      await m.issues.scheduleIssue(
        m,
        issue,
        at(180),
        issue.updatedAt,
        actor(),
        baseTime,
      );
      expect((await run(120)).published).toBe(0);
      expect((await run(240)).published).toBe(1);
    });

    it("an issue emptied after scheduling goes back to draft and the editors are told", async () => {
      const { issue } = await scheduledIssue();
      await empty(issue);
      expect(await run(120)).toEqual({ published: 0, failed: 1, retried: 0 });
      expect(await load(issue.id)).toMatchObject({
        status: "draft",
        scheduledFor: null,
        scheduledBy: null,
      });
      await expectNotices(issue.id, "empty");
      await run(180);
      await expectNotices(issue.id, "empty");
    });

    it("a scheduler removed from the team does not publish", async () => {
      const { issue } = await scheduledIssue();
      await m.db
        .delete(m.schema.magazineStaff)
        .where(eq(m.schema.magazineStaff.userId, fx.editorId));
      expect((await run(120)).failed).toBe(1);
      expect((await load(issue.id)).status).toBe("draft");
      await expectNotices(issue.id, "no_rights", [fx.ownerId, fx.adminId]);
    });

    it("a deleted community publishes nothing and tells nobody", async () => {
      const { issue } = await scheduledIssue();
      await m.db
        .update(m.schema.communities)
        .set({ deletedAt: new Date() })
        .where(eq(m.schema.communities.id, fx.community.id));
      expect((await run(120)).published).toBe(0);
      expect((await load(issue.id)).status).toBe("draft");
      expect(await notices()).toHaveLength(0);
    });

    it("one failing issue does not stop the others", async () => {
      const first = await scheduledIssue("First");
      await empty(first.issue);
      const second = await scheduledIssue("Second");
      expect(await run(120)).toEqual({ published: 1, failed: 1, retried: 0 });
      expect((await load(first.issue.id)).status).toBe("draft");
      expect((await load(second.issue.id)).status).toBe("published");
    });

    it("an issue that keeps failing for an unknown reason goes back to draft after an hour", async () => {
      const { issue } = await scheduledIssue();
      vi.spyOn(m.issues, "publishIssue").mockRejectedValue(
        new Error("Temporary failure"),
      );
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      expect(await run(90)).toEqual({ published: 0, failed: 0, retried: 1 });
      expect((await load(issue.id)).status).toBe("scheduled");
      expect(await notices()).toHaveLength(0);
      expect((await run(120)).retried).toBe(1);
      expect(await run(121)).toEqual({ published: 0, failed: 1, retried: 0 });
      expect((await load(issue.id)).status).toBe("draft");
      await expectNotices(issue.id, "error");
    });

    it("an article no longer ready returns the issue to draft", async () => {
      const { issue, articleId } = await scheduledIssue();
      await m.payload.update({
        collection: "articles",
        id: articleId,
        data: { reviewStatus: "pending_review" },
        draft: true,
      });
      expect((await run(120)).failed).toBe(1);
      expect((await load(issue.id)).status).toBe("draft");
      await expectNotices(issue.id, "invalid_item");
    });

    it("a newer editor save wins over a failed schedule", async () => {
      const { issue } = await scheduledIssue();
      await empty(issue);
      const unschedule = m.issues.unscheduleIssue;
      vi.spyOn(m.issues, "unscheduleIssue").mockImplementationOnce(
        async (...args) => {
          const latest = await load(issue.id);
          await m.issues.updateIssueDetails(
            m,
            latest,
            { title: "Saved by editor" },
            latest.updatedAt,
            actor(),
            false,
          );
          return unschedule(...args);
        },
      );
      await run(120);
      expect(await load(issue.id)).toMatchObject({
        status: "scheduled",
        title: "Saved by editor",
      });
      expect(await notices()).toHaveLength(0);
    });
  },
);
