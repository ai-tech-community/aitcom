// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import { issueBuilderPath } from "@/lib/magazines/paths";
import { referencesOfBlocks, type StoredBlock } from "../items/registry";
import {
  at,
  drafterFixture,
  isLocalDbConfigured,
  now,
  scheduleStartsAt,
} from "@/test/magazine-auto-draft-fixture";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/i18n/messages");
  return {
    getTranslations: async ({
      locale,
      namespace,
    }: {
      locale: "en" | "nl";
      namespace: "magazineEditor.autoDraft";
    }) =>
      createTranslator({
        locale,
        namespace,
        messages: await loadMessages(locale),
      }),
  };
});

describe.skipIf(!isLocalDbConfigured())(
  "automatic magazine drafts [DB integration]",
  { timeout: 30_000 },
  () => {
    const f = drafterFixture();

    it("makes one normal draft with reasons and tells the editors", async () => {
      expect(await f.pass()).toEqual({ drafted: 1, skipped: 0 });
      const { docs } = await f.issues();
      expect(docs).toHaveLength(1);
      const issue = docs[0]!;
      expect(issue).toMatchObject({
        status: "draft",
        layout: "cover-story",
        visibility: "public",
        title: "Issue of 1 November 2026",
      });
      expect(issue.items!.map((item) => item.blockType)).toEqual([
        "article",
        "article",
        "event",
        "forumThread",
        "forumThread",
        "editorial",
      ]);
      expect((await f.runs())[0]!.lastWriteAt?.toISOString()).toBe(
        issue.updatedAt,
      );
      const view = await f.m.editing.loadIssueEditorView(f.m, issue, f.actor());
      expect(Object.keys(view.autoDraft!.reasons).sort()).toEqual(
        issue.items!.map((item) => item.id!).sort(),
      );
      expect(
        issue.items!.map((item) => view.autoDraft!.reasons[item.id!]!.type),
      ).toEqual([
        "waitingSince",
        "waitingSince",
        "eventComingUp",
        "mostReplies",
        "mostReplies",
        "newMembers",
      ]);
      expect(await f.history()).toEqual([
        expect.objectContaining({
          actorName: null,
          detail: {
            event: "draft_made",
            trigger: "schedule",
            itemCount: 6,
            goesOutAt: null,
          },
        }),
      ]);
      const notices = await f.notices();
      expect(notices).toHaveLength(3);
      expect(notices.map((n) => n.userId).sort()).toEqual(
        [f.fx.ownerId, f.fx.adminId, f.fx.editorId].sort(),
      );
      for (const notice of notices)
        expect(notice).toMatchObject({
          type: "magazine_auto_draft_ready",
          metadata: expect.objectContaining({
            reviewPath: issueBuilderPath(f.fx.community.slug, issue.id),
          }),
        });
    });

    it("a second pass in the same period does nothing", async () => {
      await f.pass();
      expect(await f.pass(at(5))).toEqual({ drafted: 0, skipped: 0 });
      expect((await f.issues()).docs).toHaveLength(1);
      expect(await f.notices()).toHaveLength(3);
    });

    it("two runs at once make one draft", async () => {
      const [scheduled, manual] = await Promise.all([f.pass(), f.manual()]);
      expect((await f.issues()).docs).toHaveLength(1);
      expect(scheduled.drafted + (manual.status === "made" ? 1 : 0)).toBe(1);
      if (manual.status !== "made")
        expect(manual).toSatisfy(
          (outcome: typeof manual) =>
            outcome.status === "busy" ||
            (outcome.status === "skipped" && outcome.reason === "draft_open"),
        );
      else {
        expect(scheduled.drafted).toBe(0);
        // A busy pass has not claimed its period; the next pass sees the made draft.
        await f.pass(at(1));
        expect(await f.runs()).toContainEqual(
          expect.objectContaining({
            periodKey: "month:2026-11",
            status: "skipped",
            skipReason: "draft_open",
          }),
        );
      }
    });

    it("a fresh running claim makes a manual request busy", async () => {
      await f.m.db.insert(f.m.schema.magazineAutoDraftRuns).values({
        magazineId: f.fx.magazine.id,
        periodKey: "month:2026-10",
        trigger: "schedule",
        status: "running",
        claimedAt: now,
      });
      expect(await f.manual()).toEqual({ status: "busy" });
      expect((await f.issues()).docs).toEqual([]);
      expect(await f.notices()).toEqual([]);
    });

    it("a running claim refuses a failed period reclaim without another attempt", async () => {
      await f.m.db.insert(f.m.schema.magazineAutoDraftRuns).values([
        {
          magazineId: f.fx.magazine.id,
          periodKey: "month:2026-10",
          trigger: "schedule",
          status: "running",
          claimedAt: now,
        },
        {
          magazineId: f.fx.magazine.id,
          periodKey: "month:2026-11",
          trigger: "schedule",
          status: "failed",
          attempts: 1,
          claimedAt: at(-20),
        },
      ]);
      expect(await f.pass()).toEqual({ drafted: 0, skipped: 0 });
      expect(await f.runs()).toContainEqual(
        expect.objectContaining({
          periodKey: "month:2026-11",
          status: "failed",
          attempts: 1,
        }),
      );
      expect((await f.issues()).docs).toEqual([]);
      expect(await f.notices()).toEqual([]);
    });

    it("make a draft now while a draft is open makes none", async () => {
      await f.pass();
      const first = (await f.issues()).docs[0]!;
      expect(await f.manual()).toEqual({
        status: "skipped",
        reason: "draft_open",
        found: null,
        needed: null,
        openIssueId: first.id,
      });
      expect(await f.notices()).toHaveLength(3);
      expect((await f.history())[0]).toMatchObject({
        actorName: f.fx.editorId,
        detail: {
          event: "draft_skipped",
          reason: "draft_open",
          trigger: "manual",
        },
      });
      await f.m.issues.publishIssue(f.m, first, first.updatedAt, f.actor(), {
        now: at(1),
      });
      const article = await f.article("after-publish", at(2));
      const threads = [await f.thread(3, at(2)), await f.thread(2, at(3))];
      const outcome = await f.manual(at(10));
      expect(outcome).toMatchObject({ status: "made", itemCount: 3 });
      if (outcome.status !== "made") throw new Error("Expected a draft");
      const second = await f.m.payload.findByID({
        collection: "magazine-issues",
        id: outcome.issueId,
        depth: 0,
      });
      const refs = referencesOfBlocks(second.items as StoredBlock[]);
      expect(refs).toEqual([
        `article:${article}`,
        ...threads.map((id) => `forumThread:${id}`),
      ]);
      for (const ref of referencesOfBlocks(first.items as StoredBlock[]))
        expect(refs).not.toContain(ref);
      expect((await f.history())[0]).toMatchObject({
        actorName: f.fx.editorId,
        detail: { event: "draft_made", trigger: "manual", itemCount: 3 },
      });
    });

    it("too few things makes no draft and tells the editors once", async () => {
      await f.clearContent();
      await f.thread();
      expect(await f.pass()).toEqual({ drafted: 0, skipped: 1 });
      expect((await f.issues()).docs).toEqual([]);
      expect(await f.runs()).toEqual([
        expect.objectContaining({
          status: "skipped",
          skipReason: "too_few",
          foundCount: 1,
        }),
      ]);
      const notices = await f.notices();
      expect(notices).toHaveLength(3);
      for (const notice of notices)
        expect(notice).toMatchObject({
          type: "magazine_auto_draft_skipped",
          metadata: expect.objectContaining({
            reason: "too_few",
            found: 1,
            needed: 3,
          }),
        });
      expect(await f.pass(at(5))).toEqual({ drafted: 0, skipped: 0 });
      expect(await f.notices()).toHaveLength(3);
      await f.clearContent();
      await f.m.db
        .update(f.m.schema.communityMemberships)
        .set({ joinedAt: at(-60) })
        .where(eq(f.m.schema.communityMemberships.userId, f.fx.memberId));
      expect(await f.manual()).toMatchObject({
        status: "skipped",
        reason: "too_few",
        found: 0,
        needed: 3,
      });
      expect((await f.issues()).docs).toEqual([]);
    });

    it("a manual run with too little tells only the presser", async () => {
      await f.clearContent();
      await f.thread();
      for (let i = 0; i < 3; i++)
        expect(await f.manual()).toMatchObject({
          status: "skipped",
          reason: "too_few",
          found: 1,
          needed: 3,
        });
      expect(await f.notices()).toEqual([]);
      const history = await f.history();
      expect(history).toHaveLength(3);
      for (const entry of history)
        expect(entry).toMatchObject({
          actorName: f.fx.editorId,
          detail: {
            event: "draft_skipped",
            trigger: "manual",
            reason: "too_few",
            found: 1,
            needed: 3,
          },
        });
    });

    it("a run without edit rights makes no draft and tells the editors", async () => {
      await f.m.db
        .delete(f.m.schema.magazineStaff)
        .where(eq(f.m.schema.magazineStaff.userId, f.fx.editorId));
      expect(await f.pass()).toEqual({ drafted: 0, skipped: 1 });
      expect((await f.issues()).docs).toEqual([]);
      const notices = await f.notices();
      expect(notices.map((n) => n.userId).sort()).toEqual(
        [f.fx.ownerId, f.fx.adminId].sort(),
      );
      for (const n of notices)
        expect(n).toMatchObject({
          type: "magazine_auto_draft_skipped",
          metadata: expect.objectContaining({ reason: "no_rights" }),
        });
      expect((await f.history())[0]).toMatchObject({
        actorName: null,
        detail: { event: "draft_skipped", reason: "no_rights" },
      });
      expect(await f.manual()).toMatchObject({
        status: "skipped",
        reason: "no_rights",
      });
      expect(await f.notices()).toHaveLength(2);
    });

    it("a pass is not used up by periods that already ran", async () => {
      const settings = await f.m.settings.readAutoDraftSettings(
        f.m.db,
        f.fx.magazine.id,
      );
      for (let i = 0; i < 5; i++) {
        const { magazine } = await f.makeMagazine(
          `finished-${i}-${f.fx.suffix}`,
        );
        await f.m.db.insert(f.m.schema.magazineAutoDraftSettings).values({
          ...settings,
          publicConfirmedAt: null,
          magazineId: magazine.id,
          scheduleStartsAt,
          updatedBy: f.fx.ownerId,
        });
        await f.m.db.insert(f.m.schema.magazineAutoDraftRuns).values({
          magazineId: magazine.id,
          periodKey: "month:2026-11",
          trigger: "schedule",
          status: "made",
          claimedAt: now,
        });
      }
      // Put the unfinished magazine after all five finished ones in the due list.
      await f.m.db.insert(f.m.schema.magazineAutoDraftRuns).values({
        magazineId: f.fx.magazine.id,
        periodKey: "month:2026-10",
        trigger: "schedule",
        status: "skipped",
        claimedAt: at(1),
      });
      expect(await f.pass()).toEqual({ drafted: 1, skipped: 0 });
    });

    it("auto-publish schedules the draft to go out after N days", async () => {
      await f.save({ whenReady: "auto_publish", autoPublishDays: 3 });
      expect(await f.pass()).toEqual({ drafted: 1, skipped: 0 });
      const issue = (await f.issues()).docs[0]!;
      expect(issue).toMatchObject({
        status: "scheduled",
        scheduledVia: "auto",
        scheduledFor: at(3 * 24 * 60).toISOString(),
        scheduledBy: f.fx.editorId,
      });
      expect((await f.runs())[0]!.lastWriteAt?.toISOString()).toBe(
        issue.updatedAt,
      );
      for (const n of await f.notices())
        expect(n.content).toContain("goes out by itself on 4 November 2026");
      const result = await f.m.jobs.runMagazineIssueJobs(f.m, {
        now: at(3 * 24 * 60 + 5),
        mailer: { recipient: () => null, send: vi.fn(async () => true) },
      });
      expect(result.published).toBeGreaterThanOrEqual(1);
      const published = (await f.issues()).docs[0]!;
      expect(published).toMatchObject({
        status: "published",
        publishedVia: "auto",
      });
      const { loadIssuePage } = await import("../reading");
      const page = await loadIssuePage(f.m, {
        magazineSlug: f.fx.magazine.slug,
        issueSlug: published.slug,
        viewerId: null,
        locale: "en",
      });
      expect(page).not.toBeNull();
      expect(JSON.stringify(page)).not.toContain('"reason":');
      expect(JSON.stringify(page)).not.toContain('"autoDraft":');
    });

    it("not due yet, or switched off, or on demand, makes nothing", async () => {
      const communityLookup = vi.spyOn(f.m.db.query.communities, "findFirst");
      const magazineLookup = vi.spyOn(f.m.payload, "findByID");
      try {
        expect(await f.pass(new Date("2026-10-31T06:00:00Z"))).toEqual({
          drafted: 0,
          skipped: 0,
        });
        expect(communityLookup).not.toHaveBeenCalled();
        expect(magazineLookup).not.toHaveBeenCalled();
      } finally {
        communityLookup.mockRestore();
        magazineLookup.mockRestore();
      }
      await f.save({ enabled: false });
      expect(await f.pass()).toEqual({ drafted: 0, skipped: 0 });
      await f.save({ cadence: "on_demand" });
      expect(await f.pass()).toEqual({ drafted: 0, skipped: 0 });
      expect(await f.runs()).toEqual([]);
    });

    it("after each event makes one draft per ended event", async () => {
      await f.save({ cadence: "after_event" });
      const ended = await f.event("2026-10-31");
      await f.event("2026-11-01");
      await f.event("2026-10-30", "cancelled");
      expect(await f.pass()).toEqual({ drafted: 1, skipped: 0 });
      expect(await f.runs()).toEqual([
        expect.objectContaining({
          periodKey: `event:${ended}`,
          trigger: "event",
          status: "made",
        }),
      ]);
      expect(await f.pass(at(5))).toEqual({ drafted: 0, skipped: 0 });
      const issue = (await f.issues()).docs[0]!;
      await f.m.issues.publishIssue(f.m, issue, issue.updatedAt, f.actor(), {
        now: at(6),
      });
      const next = await f.event("2026-10-30");
      await f.pass(at(10));
      expect((await f.runs()).map((r) => r.periodKey).sort()).toEqual(
        [`event:${ended}`, `event:${next}`].sort(),
      );
    });

    it("an after-event pass without unfinished events does not load the magazine", async () => {
      await f.save({ cadence: "after_event" });
      const lookup = vi.spyOn(f.m.payload, "findByID");
      const communityLookup = vi.spyOn(f.m.db.query.communities, "findFirst");
      try {
        expect(await f.pass()).toEqual({ drafted: 0, skipped: 0 });
        expect(lookup).not.toHaveBeenCalled();
        expect(communityLookup).not.toHaveBeenCalled();
      } finally {
        lookup.mockRestore();
        communityLookup.mockRestore();
      }
    });

    it("keeps a full automatic draft within the builder's item limit", async () => {
      for (let i = 0; i < 8; i++) {
        await f.article(`limit-${i}`);
        await f.thread();
      }
      for (let i = 0; i < 9; i++) await f.event("2026-11-02");
      for (let i = 0; i < 10; i++) {
        const project = await f.m.payload.create({
          collection: "launchpad-projects",
          data: {
            title: `Project ${i} ${f.fx.suffix}`,
            slug: `draft-project-${i}-${f.fx.suffix}`,
            pitch: plainTextToLexical("Build together"),
            stage: "prototype",
            authorName: "Sanne",
            authorId: f.fx.memberId,
            communityId: f.fx.community.id,
            status: "published",
            voteCount: i,
          },
        });
        f.fx.projectIds.push(Number(project.id));
        const [news] = await f.m.db
          .insert(f.m.schema.newsItems)
          .values({
            title: `agents${f.fx.suffix} ${i}`,
            url: `https://example.test/draft-${f.fx.suffix}-${i}`,
            publishedAt: at(-60),
          })
          .returning();
        f.fx.newsIds.push(news!.id);
      }
      const settings = await f.m.settings.readAutoDraftSettings(
        f.m.db,
        f.fx.magazine.id,
      );
      await f.save({
        sources: {
          ...settings.sources,
          article: { enabled: true, max: 10 },
          event: { enabled: true, max: 10 },
          forumThread: { enabled: true, max: 10 },
          launchpadProject: { enabled: true, max: 10 },
          newsItem: { enabled: true, max: 10 },
        },
      });
      expect(await f.manual()).toMatchObject({ status: "made", itemCount: 50 });
      const issue = (await f.issues()).docs[0]!;
      expect(issue.items).toHaveLength(50);
      const view = await f.m.editing.loadIssueEditorView(f.m, issue, f.actor());
      expect(Object.keys(view.autoDraft!.reasons)).toHaveLength(50);
      expect(view.problems).toEqual([]);
    });

    it("does not retry an exhausted failed period", async () => {
      await f.m.db.insert(f.m.schema.magazineAutoDraftRuns).values({
        magazineId: f.fx.magazine.id,
        periodKey: "month:2026-11",
        trigger: "schedule",
        status: "failed",
        attempts: 3,
        claimedAt: at(-20),
      });
      expect(await f.pass()).toEqual({ drafted: 0, skipped: 0 });
      expect((await f.issues()).docs).toEqual([]);
    });

    it("drops unknown stored reasons and reads reasons only for made issues", async () => {
      const issue = await f.m.issues.createIssue(
        f.m,
        f.fx.magazine,
        { title: "Personal" },
        f.actor(),
      );
      await f.m.db.execute(
        sql`insert into app.magazine_auto_pick (issue_id, item_id, reason) values (${issue.id}, 'old', '{"type":"unknown"}'::jsonb)`,
      );
      expect(
        await f.m.picks.loadAutoDraftForIssue(f.m.db, issue.id),
      ).toBeNull();
      await f.m.db.insert(f.m.schema.magazineAutoDraftRuns).values({
        magazineId: f.fx.magazine.id,
        periodKey: "manual:legacy",
        trigger: "manual",
        status: "made",
        issueId: issue.id,
        claimedAt: now,
      });
      expect(await f.m.picks.loadAutoDraftForIssue(f.m.db, issue.id)).toEqual({
        reasons: {},
      });
    });
  },
);
