// @vitest-environment node
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  autoDraftSettingsInput,
  DEFAULT_AUTO_DRAFT_SETTINGS,
  type AutoDraftSettingsInput,
} from "@/lib/magazines/auto-draft";
import type { Magazine, MagazineIssue } from "@/payload-types";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import type * as Schema from "@/server/db/schema";

import type { Deps } from "../deps";
import type * as IssueService from "../issue-service";
import type * as History from "../issue-history";
import type * as MagazineService from "../magazine-service";
import type * as Settings from "./settings";
import type * as Runs from "./runs";
import type * as Window from "./window";

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
const input = (patch: Partial<AutoDraftSettingsInput> = {}) =>
  autoDraftSettingsInput.parse({ ...DEFAULT_AUTO_DRAFT_SETTINGS, ...patch });

describe.skipIf(!isLocalDbConfigured())(
  "automatic draft settings [DB integration]",
  { timeout: 30_000 },
  () => {
    let m: Deps & {
      schema: typeof Schema;
      settings: typeof Settings;
      runs: typeof Runs;
      window: typeof Window;
      issues: typeof IssueService;
      history: typeof History;
      magazines: typeof MagazineService;
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
    let communityIds: string[];
    let magazineIds: number[];

    beforeAll(async () => {
      const [
        { db },
        schema,
        settings,
        runs,
        window,
        issues,
        history,
        magazines,
        { getPayloadClient },
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("./settings"),
        import("./runs"),
        import("./window"),
        import("../issue-service"),
        import("../issue-history"),
        import("../magazine-service"),
        import("@/server/payload"),
      ]);
      m = {
        db,
        schema,
        settings,
        runs,
        window,
        issues,
        history,
        magazines,
        payload: await getPayloadClient(),
      };
    }, 120_000);

    beforeEach(async () => {
      communityIds = [];
      magazineIds = [];
      const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const ids = {
        ownerId: `ads-owner-${sfx}`,
        adminId: `ads-admin-${sfx}`,
        editorId: `ads-editor-${sfx}`,
        memberId: `ads-member-${sfx}`,
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
      const { community, magazine } = await makeMagazine(sfx, ids.ownerId);
      await m.db.insert(m.schema.communityMemberships).values([
        { communityId: community.id, userId: ids.ownerId, role: "owner" },
        { communityId: community.id, userId: ids.adminId, role: "admin" },
        { communityId: community.id, userId: ids.editorId, role: "member" },
        { communityId: community.id, userId: ids.memberId, role: "member" },
      ]);
      await m.db.insert(m.schema.magazineStaff).values({
        magazineId: magazine.id,
        communityId: community.id,
        userId: ids.editorId,
        role: "editor_in_chief",
        assignedBy: ids.ownerId,
      });
      fx = { sfx, ...ids, community, magazine };
    }, 60_000);

    afterEach(async () => {
      if (!fx) return;
      const { db, payload, schema: s } = m;
      const userIds = [fx.ownerId, fx.adminId, fx.editorId, fx.memberId];
      await payload.delete({
        collection: "magazine-issues",
        where: { magazine: { in: magazineIds } },
      });
      await payload.delete({
        collection: "magazines",
        where: { id: { in: magazineIds } },
      });
      await db
        .delete(s.magazineStaff)
        .where(inArray(s.magazineStaff.userId, userIds));
      await db
        .delete(s.spaces)
        .where(inArray(s.spaces.communityId, communityIds));
      await db
        .delete(s.communityMemberships)
        .where(inArray(s.communityMemberships.userId, userIds));
      await db
        .delete(s.communities)
        .where(inArray(s.communities.id, communityIds));
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

    async function makeMagazine(suffix: string, ownerId = fx.ownerId) {
      const [community] = await m.db
        .insert(m.schema.communities)
        .values({
          name: `Automatic ${suffix}`,
          slug: `ads-${suffix}`,
          createdBy: ownerId,
          isListedInDirectory: true,
        })
        .returning();
      communityIds.push(community!.id);
      const magazine = await m.magazines.saveMagazineSettings(
        m,
        community!,
        {
          name: "The Gazette",
          slug: `ads-${suffix}`,
          topics: [],
          defaultVisibility: "members",
        },
        ownerId,
        true,
      );
      magazineIds.push(magazine.id);
      return { community: community!, magazine };
    }

    const actor = () => ({
      userId: fx.ownerId,
      community: fx.community,
      leadsCommunity: true,
    });
    const save = (patch: Partial<AutoDraftSettingsInput> = {}, now = at(0)) =>
      m.settings.saveAutoDraftSettings(
        m,
        fx.magazine,
        input(patch),
        actor(),
        now,
      );
    const load = (id: number) =>
      m.payload.findByID({ collection: "magazine-issues", id, depth: 0 });
    const history = () => m.history.listIssueHistory(m.db, fx.magazine.id);

    async function filledIssue(title: string) {
      const issue = await m.issues.createIssue(
        m,
        fx.magazine,
        { title },
        actor(),
      );
      return (
        await m.issues.setIssueItems(
          m,
          issue,
          [
            {
              kind: "editorial",
              body: plainTextToLexical("News from the community"),
            },
          ],
          issue.updatedAt,
          { ...actor(), via: "auto" },
        )
      ).issue;
    }

    async function scheduledIssue(title: string, via?: "auto") {
      const issue = await filledIssue(title);
      return m.issues.scheduleIssue(
        m,
        issue,
        at(60),
        issue.updatedAt,
        actor(),
        at(0),
        { via },
      );
    }

    async function nameIssue(
      issue: MagazineIssue,
      status: "made" | "failed" | "running" = "made",
      minutes = 0,
    ) {
      await m.db.insert(m.schema.magazineAutoDraftRuns).values({
        magazineId: fx.magazine.id,
        periodKey: `manual:${crypto.randomUUID()}`,
        trigger: "manual",
        status,
        issueId: issue.id,
        claimedAt: at(minutes),
      });
    }

    it("reads defaults until saved", async () => {
      expect(
        await m.settings.readAutoDraftSettings(m.db, fx.magazine.id),
      ).toEqual({
        ...DEFAULT_AUTO_DRAFT_SETTINGS,
        scheduleStartsAt: null,
        updatedBy: null,
      });
    });

    it("saves and reads back every setting", async () => {
      const full = input({
        enabled: true,
        cadence: "biweekly",
        monthDay: 14,
        weekday: 5,
        lookBack: "days_7",
        layout: "cover-story",
        visibility: "public",
        sources: {
          article: { enabled: false, max: 8 },
          storyline: { enabled: true, max: 2 },
          event: { enabled: false, max: 7 },
          forumThread: { enabled: true, max: 6 },
          launchpadProject: { enabled: false, max: 9 },
          newsItem: { enabled: true, max: 4 },
          welcome: { enabled: false, max: 1 },
        },
        neverReuse: false,
        whenReady: "auto_publish",
        autoPublishDays: 9,
      });
      const { confirmUnlistedPublic, ...expected } = full;
      const stored = {
        ...expected,
        publicConfirmedBy: null,
        publicConfirmedAt: null,
        scheduleStartsAt: at(0),
        updatedBy: fx.ownerId,
      };
      expect(
        await m.settings.saveAutoDraftSettings(
          m,
          fx.magazine,
          { ...expected, confirmUnlistedPublic },
          actor(),
          at(0),
        ),
      ).toEqual(stored);
      expect(
        await m.settings.readAutoDraftSettings(m.db, fx.magazine.id),
      ).toEqual(stored);
      await save({ sources: { article: { enabled: false, max: 2 } } });
      expect(
        (await m.settings.readAutoDraftSettings(m.db, fx.magazine.id)).sources,
      ).toEqual({
        ...DEFAULT_AUTO_DRAFT_SETTINGS.sources,
        article: { enabled: false, max: 2 },
      });
    });

    it("starts the schedule when switched on or when the day changes", async () => {
      expect((await save({ enabled: true })).scheduleStartsAt).toEqual(at(0));
      expect((await save({ enabled: true }, at(10))).scheduleStartsAt).toEqual(
        at(0),
      );
      expect(
        (await save({ enabled: true, monthDay: 10 }, at(20))).scheduleStartsAt,
      ).toEqual(at(20));
      expect(
        (await save({ enabled: true, monthDay: 10, weekday: 3 }, at(30)))
          .scheduleStartsAt,
      ).toEqual(at(30));
      expect(
        (
          await save(
            { enabled: true, cadence: "weekly", monthDay: 10, weekday: 3 },
            at(40),
          )
        ).scheduleStartsAt,
      ).toEqual(at(40));
      expect(
        (await save({ enabled: false }, at(50))).scheduleStartsAt,
      ).toBeNull();
      expect((await save({ enabled: true }, at(60))).scheduleStartsAt).toEqual(
        at(60),
      );
    });

    it("public drafts in an unlisted community need a leader's confirmation", async () => {
      await m.db
        .update(m.schema.communities)
        .set({ isListedInDirectory: false })
        .where(eq(m.schema.communities.id, fx.community.id));
      fx.community.isListedInDirectory = false;
      await expect(save({ visibility: "public" })).rejects.toMatchObject({
        message: "CONFIRM_UNLISTED_PUBLIC",
      });
      await expect(
        m.settings.saveAutoDraftSettings(
          m,
          fx.magazine,
          input({ visibility: "public", confirmUnlistedPublic: true }),
          { ...actor(), userId: fx.editorId, leadsCommunity: false },
          at(0),
        ),
      ).rejects.toMatchObject({ message: "UNLISTED_PUBLIC_LEADERS_ONLY" });
      expect(
        await save({ visibility: "public", confirmUnlistedPublic: true }),
      ).toMatchObject({
        visibility: "public",
        publicConfirmedBy: fx.ownerId,
        publicConfirmedAt: at(0).toISOString(),
      });
      expect(
        await m.settings.saveAutoDraftSettings(
          m,
          fx.magazine,
          input({ visibility: "public" }),
          { ...actor(), userId: fx.editorId, leadsCommunity: false },
          at(10),
        ),
      ).toMatchObject({
        publicConfirmedBy: fx.ownerId,
        publicConfirmedAt: at(0).toISOString(),
      });
      expect(await save({ visibility: null })).toMatchObject({
        visibility: null,
        publicConfirmedBy: null,
        publicConfirmedAt: null,
      });
      await expect(save({ visibility: "public" })).rejects.toMatchObject({
        message: "CONFIRM_UNLISTED_PUBLIC",
      });
    });

    it("saving tell-me-only stops a waiting automatic publish", async () => {
      const automatic = await scheduledIssue("Automatic", "auto");
      const personal = await scheduledIssue("Personal");
      await nameIssue(automatic);
      await save({ whenReady: "auto_publish" });
      expect(await load(automatic.id)).toMatchObject({
        status: "scheduled",
        scheduledVia: "auto",
      });
      await m.settings.saveAutoDraftSettings(
        m,
        fx.magazine,
        input({ enabled: false, whenReady: "notify" }),
        { ...actor(), userId: fx.editorId, leadsCommunity: false },
        at(10),
      );
      expect(await load(automatic.id)).toMatchObject({
        status: "draft",
        scheduledVia: null,
        scheduledBy: null,
        scheduledFor: null,
      });
      expect(await load(personal.id)).toMatchObject({
        status: "scheduled",
        scheduledVia: "schedule",
      });
      expect(await history()).toEqual([
        expect.objectContaining({
          detail: { event: "auto_publish_stopped", why: "stopped" },
          actorName: fx.editorId,
          issue: expect.objectContaining({ id: automatic.id }),
        }),
      ]);
    });

    it("changing confirmed public settings keeps new values and stops automatic publishing", async () => {
      await m.db
        .update(m.schema.communities)
        .set({ isListedInDirectory: false })
        .where(eq(m.schema.communities.id, fx.community.id));
      fx.community.isListedInDirectory = false;
      await save({
        enabled: true,
        visibility: "public",
        confirmUnlistedPublic: true,
        whenReady: "auto_publish",
      });
      const issue = await scheduledIssue("Confirmed public", "auto");
      await nameIssue(issue);

      const saved = await m.settings.saveAutoDraftSettings(
        m,
        fx.magazine,
        input({
          enabled: false,
          cadence: "weekly",
          monthDay: 8,
          weekday: 4,
          lookBack: "days_7",
          visibility: "public",
          neverReuse: false,
          whenReady: "notify",
          autoPublishDays: 9,
        }),
        { ...actor(), userId: fx.editorId, leadsCommunity: false },
        at(10),
      );
      expect(saved).toMatchObject({
        enabled: false,
        cadence: "weekly",
        monthDay: 8,
        weekday: 4,
        lookBack: "days_7",
        visibility: "public",
        publicConfirmedBy: fx.ownerId,
        publicConfirmedAt: at(0).toISOString(),
        neverReuse: false,
        whenReady: "notify",
        autoPublishDays: 9,
        scheduleStartsAt: null,
        updatedBy: fx.editorId,
      });
      expect(await load(issue.id)).toMatchObject({
        status: "draft",
        scheduledVia: null,
      });
      expect(await m.settings.autoPublishAllowed(m.db, fx.magazine.id)).toBe(
        false,
      );
    });

    it.each(["schedule", null] as const)(
      "a person's schedule on the automatic draft itself is untouched (%s)",
      async (scheduledVia) => {
        let automatic = await scheduledIssue("Rescheduled", "auto");
        await nameIssue(automatic);
        automatic = await m.issues.scheduleIssue(
          m,
          automatic,
          at(120),
          automatic.updatedAt,
          actor(),
          at(0),
        );
        if (scheduledVia === null) {
          automatic = await m.payload.update({
            collection: "magazine-issues",
            id: automatic.id,
            data: { scheduledVia: null },
            depth: 0,
          });
        }
        const before = await history();
        await save({ whenReady: "notify" });
        expect(await load(automatic.id)).toMatchObject({
          status: "scheduled",
          scheduledVia,
          scheduledFor: automatic.scheduledFor,
        });
        expect(await history()).toEqual(before);
      },
    );

    it("lists only settings that can fall due", async () => {
      expect(await m.settings.autoPublishAllowed(m.db, fx.magazine.id)).toBe(
        false,
      );
      await save({ enabled: true, whenReady: "auto_publish" });
      const eligible = await m.settings.readAutoDraftSettings(
        m.db,
        fx.magazine.id,
      );
      const excludedSettings: [
        string,
        Partial<typeof m.schema.magazineAutoDraftSettings.$inferInsert>,
      ][] = [
        ["disabled", { enabled: false }],
        ["on-demand", { cadence: "on_demand" }],
        ["no-actor", { updatedBy: null }],
        ["no-start", { scheduleStartsAt: null }],
        ["deleted", {}],
      ];
      for (const [label, patch] of excludedSettings) {
        const { community, magazine } = await makeMagazine(
          `${label}-${fx.sfx}`,
        );
        await m.db.insert(m.schema.magazineAutoDraftSettings).values({
          magazineId: magazine.id,
          enabled: true,
          scheduleStartsAt: at(0),
          updatedBy: fx.ownerId,
          ...patch,
        });
        if (label === "deleted")
          await m.db
            .update(m.schema.communities)
            .set({ deletedAt: at(0) })
            .where(eq(m.schema.communities.id, community.id));
      }
      const due = (await m.settings.listDueAutoDraftSettings(m.db)).filter(
        (s) => magazineIds.includes(s.magazineId),
      );
      expect(due).toEqual([
        {
          ...eligible,
          magazineId: fx.magazine.id,
          communityId: fx.community.id,
          communitySlug: fx.community.slug,
          lastRunAt: null,
        },
      ]);
      expect(await m.settings.autoPublishAllowed(m.db, fx.magazine.id)).toBe(
        true,
      );
      await save({ whenReady: "notify" });
      expect(await m.settings.autoPublishAllowed(m.db, fx.magazine.id)).toBe(
        false,
      );
    });

    it("orders due magazines by their latest claim, with untried magazines first", async () => {
      const fixtures = [
        fx,
        await makeMagazine(`second-${fx.sfx}`),
        await makeMagazine(`third-${fx.sfx}`),
        await makeMagazine(`fourth-${fx.sfx}`),
      ];
      for (const { magazine } of fixtures)
        await m.settings.saveAutoDraftSettings(
          m,
          magazine,
          input({ enabled: true }),
          actor(),
          at(0),
        );
      for (const [index, minutes] of [
        [0, 20],
        [0, -20],
        [1, 10],
      ] as const) {
        await m.db.insert(m.schema.magazineAutoDraftRuns).values({
          magazineId: fixtures[index]!.magazine.id,
          periodKey: `manual:${minutes}`,
          trigger: "manual",
          status: "failed",
          claimedAt: at(minutes),
        });
      }
      const due = (await m.settings.listDueAutoDraftSettings(m.db)).filter(
        (s) => magazineIds.includes(s.magazineId),
      );
      expect(
        due.map((s) => ({ id: s.magazineId, lastRunAt: s.lastRunAt })),
      ).toEqual([
        { id: fixtures[2]!.magazine.id, lastRunAt: null },
        { id: fixtures[3]!.magazine.id, lastRunAt: null },
        { id: fixtures[1]!.magazine.id, lastRunAt: at(10) },
        { id: fx.magazine.id, lastRunAt: at(20) },
      ]);
    });

    it("looks back from the last published issue", async () => {
      expect(
        await m.window.suggestWindowFor(
          m,
          fx.magazine.id,
          "since_last_issue",
          at(0),
        ),
      ).toEqual({
        since: new Date("2026-09-27T12:00:00Z"),
        until: at(0),
      });
      for (const minutes of [-120, -60]) {
        const issue = await filledIssue(`Published ${minutes}`);
        await m.issues.publishIssue(m, issue, issue.updatedAt, actor(), {
          now: at(minutes),
        });
      }
      await filledIssue("Later draft");
      expect(
        await m.window.suggestWindowFor(
          m,
          fx.magazine.id,
          "since_last_issue",
          at(0),
        ),
      ).toEqual({ since: at(-60), until: at(0) });
      expect(
        await m.window.suggestWindowFor(m, fx.magazine.id, "days_7", at(0)),
      ).toEqual({ since: new Date("2026-10-20T12:00:00Z"), until: at(0) });
    });

    it("finds the newest open issue from any run, including a failed attempt", async () => {
      expect(await m.runs.findOpenAutoDraft(m, fx.magazine.id)).toBeNull();
      const older = await filledIssue("Older automatic");
      await nameIssue(older, "made", -20);
      const published = await filledIssue("Published automatic");
      await m.issues.publishIssue(m, published, published.updatedAt, actor(), {
        now: at(-10),
      });
      await nameIssue(published, "made", -10);
      const crashed = await filledIssue("Crashed automatic");
      await nameIssue(crashed, "failed", 0);
      await filledIssue("Newer personal draft");
      expect((await m.runs.findOpenAutoDraft(m, fx.magazine.id))?.id).toBe(
        crashed.id,
      );
      await m.issues.deleteDraftIssue(m, crashed, actor());
      expect((await m.runs.findOpenAutoDraft(m, fx.magazine.id))?.id).toBe(
        older.id,
      );
    });
  },
);
