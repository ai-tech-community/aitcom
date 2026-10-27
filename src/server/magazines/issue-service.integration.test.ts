// @vitest-environment node
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type { MagazineIssue } from "@/payload-types";
import type * as ArticleCredit from "@/server/articles/credit";

import type { PayloadClient } from "./deps";
import type * as ArticlePlacement from "./article-placement";
import type * as ArticlePublication from "./article-publication";
import type * as IssueService from "./issue-service";
import type * as MagazineService from "./magazine-service";
import type * as Registry from "./items/registry";
import { itemContextFor } from "./items/context";

/**
 * The real credit, with a switch that makes the next N credits throw AFTER
 * they have written XP: a failed credit must leave no XP behind.
 */
const creditFault = vi.hoisted(() => ({ failNext: 0 }));
vi.mock("@/server/articles/credit", async (importOriginal) => {
  const real = await importOriginal<typeof ArticleCredit>();
  return {
    ...real,
    creditArticlePublication: async (
      ...args: Parameters<typeof real.creditArticlePublication>
    ) => {
      await real.creditArticlePublication(...args);
      if (creditFault.failNext > 0) {
        creditFault.failNext--;
        throw new Error("credit failed (test)");
      }
    },
  };
});

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

/** The refusal code a magazine service threw (the TRPCError message). */
async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected a refusal");
}

/**
 * The magazine and issue services against real Payload documents (spec
 * 2026-10-26, ADR-0042/0043): creating, numbering, saving items, placement,
 * publishing and crediting.
 */
describe.skipIf(!RUN_DB)("magazine and issue services [DB integration]", () => {
  type Mods = {
    db: typeof Db;
    schema: typeof Schema;
    magazines: typeof MagazineService;
    issues: typeof IssueService;
    placement: typeof ArticlePlacement;
    publication: typeof ArticlePublication;
    registry: typeof Registry;
    payload: PayloadClient;
    writerMetric: (userId: string) => Promise<number>;
    xpArticlePublished: number;
  };
  let m: Mods;

  type Fixture = {
    sfx: string;
    userId: string;
    userIds: string[];
    communityIds: string[];
    articleIds: number[];
  };
  let fx: Fixture;

  beforeAll(async () => {
    const [
      { db },
      schema,
      magazines,
      issues,
      placement,
      publication,
      registry,
      { getPayloadClient },
      { TRACK_METRICS },
      { XP_AMOUNTS },
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("./magazine-service"),
      import("./issue-service"),
      import("./article-placement"),
      import("./article-publication"),
      import("./items/registry"),
      import("@/server/payload"),
      import("@/server/badges/metrics"),
      import("@/lib/gamification"),
    ]);
    const payload = await getPayloadClient();
    m = {
      db,
      schema,
      magazines,
      issues,
      placement,
      publication,
      registry,
      payload,
      writerMetric: (userId) =>
        TRACK_METRICS.writer({ db, payload: async () => payload }, userId),
      xpArticlePublished: XP_AMOUNTS.ARTICLE_PUBLISHED,
    };
  }, 120_000);

  beforeEach(async () => {
    const { db, schema } = m;
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const userId = `isv-editor-${sfx}`;
    await db
      .insert(schema.user)
      .values({ id: userId, email: `${userId}@example.test`, name: userId });
    await db
      .insert(schema.memberProfiles)
      .values({ userId, displayName: "Editor" });
    fx = { sfx, userId, userIds: [userId], communityIds: [], articleIds: [] };
    creditFault.failNext = 0;
  }, 60_000);

  afterEach(async () => {
    const { db, schema, payload } = m;
    const { inArray } = await import("drizzle-orm");
    if (fx.communityIds.length > 0) {
      const { docs: mags } = await payload.find({
        collection: "magazines",
        where: { communityId: { in: fx.communityIds } },
        depth: 0,
        pagination: false,
      });
      const magazineIds = mags.map((mag) => mag.id);
      // Issues first: their article blocks hold a required reference.
      if (magazineIds.length > 0) {
        await db
          .delete(schema.magazineSubscriptions)
          .where(inArray(schema.magazineSubscriptions.magazineId, magazineIds));
        // Deleting the issues clears their articles' placement (the
        // foreign key is ON DELETE set null).
        await payload.delete({
          collection: "magazine-issues",
          where: { magazine: { in: magazineIds } },
        });
      }
      if (fx.articleIds.length > 0) {
        await payload.delete({
          collection: "articles",
          where: { id: { in: fx.articleIds } },
        });
      }
      if (magazineIds.length > 0) {
        await payload.delete({
          collection: "magazines",
          where: { id: { in: magazineIds } },
        });
      }
      await db
        .delete(schema.spaces)
        .where(inArray(schema.spaces.communityId, fx.communityIds));
      await db
        .delete(schema.magazineStaff)
        .where(inArray(schema.magazineStaff.userId, fx.userIds));
      await db
        .delete(schema.communityMemberships)
        .where(inArray(schema.communityMemberships.userId, fx.userIds));
      await db
        .delete(schema.communities)
        .where(inArray(schema.communities.id, fx.communityIds));
    }
    await db
      .delete(schema.pointsEvents)
      .where(inArray(schema.pointsEvents.userId, fx.userIds));
    await db
      .delete(schema.activityEvents)
      .where(inArray(schema.activityEvents.actorId, fx.userIds));
    await db
      .delete(schema.notifications)
      .where(inArray(schema.notifications.userId, fx.userIds));
    await db
      .delete(schema.memberBadges)
      .where(inArray(schema.memberBadges.userId, fx.userIds));
    await db
      .delete(schema.memberProfiles)
      .where(inArray(schema.memberProfiles.userId, fx.userIds));
    await db
      .delete(schema.communityMemberships)
      .where(inArray(schema.communityMemberships.userId, fx.userIds));
    await db.delete(schema.user).where(inArray(schema.user.id, fx.userIds));
  }, 60_000);

  // ── Fixtures ──────────────────────────────────────────────────────────

  type Community = { id: string; slug: string; isListedInDirectory: boolean };

  async function community(
    label: string,
    opts: { listed?: boolean; defaultSpaces?: boolean } = {},
  ): Promise<Community> {
    const { db, schema } = m;
    const [row] = await db
      .insert(schema.communities)
      .values({
        name: `Issues ${label} ${fx.sfx}`,
        slug: `isv-${label}-${fx.sfx}`,
        createdBy: fx.userId,
        isListedInDirectory: opts.listed ?? true,
      })
      .returning();
    fx.communityIds.push(row!.id);
    if (opts.defaultSpaces) {
      const { buildDefaultSpaceRows } =
        await import("@/server/communities/space-defaults");
      await db.insert(schema.spaces).values(buildDefaultSpaceRows(row!.id));
    }
    return {
      id: row!.id,
      slug: row!.slug,
      isListedInDirectory: row!.isListedInDirectory,
    };
  }

  function settings(
    label: string,
    extra: Partial<MagazineService.MagazineSettingsInput> = {},
  ): MagazineService.MagazineSettingsInput {
    return {
      name: `Magazine ${label}`,
      slug: `isv-${label}-${fx.sfx}`,
      topics: [],
      defaultVisibility: "members",
      ...extra,
    };
  }

  async function magazineIn(c: Community, label = "mag") {
    return m.magazines.saveMagazineSettings(
      m,
      c,
      settings(label),
      fx.userId,
      true,
    );
  }

  function actor(c: Community): IssueService.IssueActor {
    return { userId: fx.userId, community: c };
  }

  async function article(
    label: string,
    magazineId: number,
    data: Record<string, unknown> = {},
  ): Promise<number> {
    const doc = await m.payload.create({
      collection: "articles",
      data: {
        title: `${label} first text`,
        slug: `isv-${label}-${fx.sfx}`,
        content: richText(`${label} first text`),
        type: "article",
        authorId: fx.userId,
        authorName: "Editor",
        authorType: "member",
        reviewStatus: "approved",
        status: "draft",
        magazine: magazineId,
        ...data,
      } as never,
    });
    fx.articleIds.push(doc.id);
    return doc.id;
  }

  function articleItem(
    articleId: number,
    id?: string,
  ): Registry.IssueItemInput {
    return { kind: "article", articleId, ...(id ? { id } : {}) };
  }

  function editorialItem(text: string): Registry.IssueItemInput {
    return { kind: "editorial", heading: text, body: richText(text) };
  }

  async function setItems(
    c: Community,
    issue: MagazineIssue,
    items: Registry.IssueItemInput[],
  ): Promise<MagazineIssue> {
    return (
      await m.issues.setIssueItems(m, issue, items, issue.updatedAt, actor(c))
    ).issue;
  }

  async function placementOf(articleId: number, draft: boolean) {
    const doc = await m.payload.findByID({
      collection: "articles",
      id: articleId,
      depth: 0,
      draft,
    });
    const value = doc.magazineIssue;
    return typeof value === "object" && value !== null
      ? value.id
      : (value ?? null);
  }

  /** Whether the article holds its exactly-once credit claim. */
  async function isCredited(articleId: number): Promise<boolean> {
    const { eq } = await import("drizzle-orm");
    const rows = await m.db
      .select({ articleId: m.schema.magazineArticleCredits.articleId })
      .from(m.schema.magazineArticleCredits)
      .where(eq(m.schema.magazineArticleCredits.articleId, articleId));
    return rows.length > 0;
  }

  /** The placement on the main row, as reader queries see it (raw SQL). */
  async function livePlacementOf(articleId: number): Promise<number | null> {
    const { sql } = await import("drizzle-orm");
    const { rows } = await m.db.execute<{ issue: number | null }>(sql`
      SELECT "magazine_issue_id" AS issue FROM "public"."articles"
      WHERE "id" = ${articleId}
    `);
    return rows[0]?.issue ?? null;
  }

  async function xpOf(userId: string): Promise<number> {
    const { eq } = await import("drizzle-orm");
    const profile = await m.db.query.memberProfiles.findFirst({
      where: eq(m.schema.memberProfiles.userId, userId),
      columns: { xp: true },
    });
    return profile?.xp ?? 0;
  }

  async function pointsEventCount(userId: string): Promise<number> {
    const { eq } = await import("drizzle-orm");
    const rows = await m.db
      .select({ id: m.schema.pointsEvents.id })
      .from(m.schema.pointsEvents)
      .where(eq(m.schema.pointsEvents.userId, userId));
    return rows.length;
  }

  describe("automatic schedules and issue history", () => {
    const baseTime = new Date("2026-10-27T12:00:00Z");
    const at = (minutes: number) =>
      new Date(baseTime.getTime() + minutes * 60_000);
    const history = async (magazineId: number) =>
      (await import("./issue-history")).listIssueHistory(m.db, magazineId);

    async function fixture() {
      const c = await community("automatic");
      const mag = await magazineIn(c);
      const editorId = `isv-appointed-${fx.sfx}`;
      fx.userIds.push(editorId);
      await m.db.insert(m.schema.user).values({
        id: editorId,
        email: `${editorId}@example.test`,
        name: "Appointed editor",
      });
      await m.db.insert(m.schema.memberProfiles).values({
        userId: editorId,
        displayName: "Appointed editor",
      });
      await m.db.insert(m.schema.communityMemberships).values([
        { communityId: c.id, userId: fx.userId, role: "owner" },
        { communityId: c.id, userId: editorId, role: "member" },
      ]);
      await m.db.insert(m.schema.magazineStaff).values({
        magazineId: mag.id,
        communityId: c.id,
        userId: editorId,
        role: "editor",
        assignedBy: fx.userId,
      });
      const editor = { userId: editorId, community: c };
      const draft = await m.issues.createIssue(
        m,
        mag,
        { title: "Automatic" },
        actor(c),
      );
      const articleId = await article("automatic", mag.id);
      const { issue } = await m.issues.setIssueItems(
        m,
        draft,
        [articleItem(articleId), editorialItem("A note")],
        draft.updatedAt,
        { ...editor, via: "auto" },
      );
      return { c, mag, editor, issue, articleId };
    }

    async function automatic(
      issue: MagazineIssue,
      editor: IssueService.IssueActor,
    ) {
      return m.issues.scheduleIssue(
        m,
        issue,
        at(60 * 24),
        issue.updatedAt,
        editor,
        at(0),
        { via: "auto" },
      );
    }

    it("an automatic schedule is recorded as automatic", async () => {
      const { c, mag, issue, editor } = await fixture();
      const scheduled = await automatic(issue, editor);
      expect(scheduled.scheduledVia).toBe("auto");
      const stopped = await m.issues.unscheduleIssue(
        m,
        scheduled,
        scheduled.updatedAt,
        editor,
      );
      expect(stopped.scheduledVia).toBeNull();
      const manual = await m.issues.scheduleIssue(
        m,
        stopped,
        at(60 * 24),
        stopped.updatedAt,
        editor,
        at(0),
      );
      expect(manual.scheduledVia).toBe("schedule");
      const rescheduled = await automatic(manual, editor);
      const takenOver = await m.issues.scheduleIssue(
        m,
        rescheduled,
        at(60 * 24),
        rescheduled.updatedAt,
        editor,
        at(0),
      );
      expect(takenOver.scheduledVia).toBe("schedule");
      const published = await m.issues.publishIssue(
        m,
        takenOver,
        takenOver.updatedAt,
        actor(c),
      );
      expect(published.scheduledVia).toBeNull();
      expect(await history(mag.id)).toHaveLength(2);
    });

    it("a person's edit stops the automatic publish", async () => {
      const { issue, editor, mag, articleId } = await fixture();
      const scheduled = await automatic(issue, editor);
      const { issue: saved } = await m.issues.setIssueItems(
        m,
        scheduled,
        [articleItem(articleId, scheduled.items![0]!.id!)],
        scheduled.updatedAt,
        editor,
      );
      expect(saved).toMatchObject({
        status: "draft",
        scheduledFor: null,
        scheduledBy: null,
        scheduledVia: null,
      });
      expect(saved.items).toHaveLength(1);
      const rows = await history(mag.id);
      expect(
        rows.map(({ detail, actorName, issue: snapshot }) => ({
          detail,
          actorName,
          issue: snapshot,
        })),
      ).toEqual([
        {
          detail: { event: "auto_publish_stopped", why: "edited" },
          actorName: "Appointed editor",
          issue: {
            id: issue.id,
            number: Number(issue.number),
            title: issue.title,
            status: "draft",
          },
        },
        {
          detail: { event: "items_changed", itemCount: 1 },
          actorName: "Appointed editor",
          issue: {
            id: issue.id,
            number: Number(issue.number),
            title: issue.title,
            status: "draft",
          },
        },
      ]);
      expect(rows[0]!.createdAt).toBe(rows[1]!.createdAt);
      expect(rows[0]!.id).toBeGreaterThan(rows[1]!.id);
      const again = await automatic(saved, editor);
      const renamed = await m.issues.updateIssueDetails(
        m,
        again,
        { title: "Edited title" },
        again.updatedAt,
        editor,
        false,
      );
      expect(renamed).toMatchObject({
        title: "Edited title",
        status: "draft",
        scheduledFor: null,
        scheduledBy: null,
        scheduledVia: null,
      });
      expect((await history(mag.id)).map((row) => row.detail)).toEqual([
        { event: "auto_publish_stopped", why: "edited" },
        { event: "auto_publish_stopped", why: "edited" },
        { event: "items_changed", itemCount: 1 },
      ]);
      expect((await history(mag.id))[0]).toMatchObject({
        actorName: "Appointed editor",
        issue: { title: "Edited title" },
      });
    });

    it("the auto-drafter's own save does not stop it", async () => {
      const { issue, editor, mag, articleId } = await fixture();
      const scheduled = await automatic(issue, editor);
      const auto = { ...editor, via: "auto" as const };
      const { issue: saved } = await m.issues.setIssueItems(
        m,
        scheduled,
        [articleItem(articleId, scheduled.items![0]!.id!)],
        scheduled.updatedAt,
        auto,
      );
      const renamed = await m.issues.updateIssueDetails(
        m,
        saved,
        { title: "Automatic title" },
        saved.updatedAt,
        auto,
        false,
      );
      expect(renamed).toMatchObject({
        status: "scheduled",
        scheduledVia: "auto",
        scheduledBy: editor.userId,
        scheduledFor: at(60 * 24).toISOString(),
      });
      expect(await history(mag.id)).toEqual([]);
    });

    it("a person's schedule is not touched by edits", async () => {
      const { issue, editor } = await fixture();
      const scheduled = await m.issues.scheduleIssue(
        m,
        issue,
        at(60 * 24),
        issue.updatedAt,
        editor,
        at(0),
      );
      const { issue: saved } = await m.issues.setIssueItems(
        m,
        scheduled,
        [editorialItem("Changed")],
        scheduled.updatedAt,
        editor,
      );
      const renamed = await m.issues.updateIssueDetails(
        m,
        saved,
        { title: "Changed title" },
        saved.updatedAt,
        editor,
        false,
      );
      expect(renamed).toMatchObject({
        status: "scheduled",
        scheduledVia: "schedule",
        scheduledBy: editor.userId,
        scheduledFor: at(60 * 24).toISOString(),
      });
    });

    it("stopping an automatic publish is in the history", async () => {
      const { issue, editor, mag } = await fixture();
      const scheduled = await automatic(issue, editor);
      const stopped = await m.issues.unscheduleIssue(
        m,
        scheduled,
        scheduled.updatedAt,
        editor,
      );
      const again = await automatic(stopped, editor);
      const failed = await m.issues.unscheduleIssue(
        m,
        again,
        again.updatedAt,
        null,
        { failure: "auto_off" },
      );
      const manual = await m.issues.scheduleIssue(
        m,
        failed,
        at(60 * 24),
        failed.updatedAt,
        editor,
        at(0),
      );
      await m.issues.unscheduleIssue(m, manual, manual.updatedAt, editor);
      expect(
        (await history(mag.id)).map(({ detail, actorName }) => ({
          detail,
          actorName,
        })),
      ).toEqual([
        {
          detail: {
            event: "auto_publish_stopped",
            why: "failed",
            failure: "auto_off",
          },
          actorName: null,
        },
        {
          detail: { event: "auto_publish_stopped", why: "stopped" },
          actorName: "Appointed editor",
        },
      ]);
    });

    it("history says how and by whom an issue went out or was deleted", async () => {
      const { c, issue, editor, mag } = await fixture();
      await m.issues.publishIssue(m, issue, issue.updatedAt, actor(c));
      const another = await m.issues.createIssue(
        m,
        mag,
        { title: "Another" },
        actor(c),
      );
      const { issue: filled } = await m.issues.setIssueItems(
        m,
        another,
        [editorialItem("Automatic")],
        another.updatedAt,
        { ...editor, via: "auto" },
      );
      const scheduled = await automatic(filled, editor);
      const published = await m.issues.publishIssue(
        m,
        scheduled,
        scheduled.updatedAt,
        editor,
        { origin: "auto" },
      );
      expect(published.scheduledVia).toBeNull();
      const deleted = await m.issues.createIssue(
        m,
        mag,
        { title: "Deleted title" },
        editor,
      );
      await m.issues.deleteDraftIssue(m, deleted, editor);
      expect(
        await m.payload.findByID({
          collection: "magazine-issues",
          id: deleted.id,
          disableErrors: true,
        }),
      ).toBeNull();
      const hidden = await m.issues.createIssue(
        m,
        mag,
        { title: "Half-made" },
        editor,
      );
      await m.issues.deleteDraftIssue(m, hidden, { ...editor, via: "auto" });
      expect(await history(mag.id)).toMatchObject([
        {
          detail: { event: "deleted" },
          actorName: "Appointed editor",
          issue: {
            id: null,
            number: Number(deleted.number),
            title: "Deleted title",
            status: null,
          },
        },
        {
          detail: { event: "published", origin: "auto" },
          actorName: null,
          issue: { id: published.id, status: "published" },
        },
        {
          detail: { event: "published", origin: "button" },
          actorName: fx.userId,
          issue: { id: issue.id, status: "published" },
        },
      ]);
      const { eq } = await import("drizzle-orm");
      const stored = await m.db
        .select()
        .from(m.schema.magazineIssueHistory)
        .where(eq(m.schema.magazineIssueHistory.magazineId, mag.id));
      expect(
        stored
          .filter((row) => row.event === "published")
          .map((row) => row.origin)
          .sort(),
      ).toEqual(["auto", "button"]);
      expect(stored.find((row) => row.event === "deleted")).toMatchObject({
        origin: null,
        issueId: null,
        actorId: editor.userId,
      });
    });

    it("deletion history snapshots the draft claimed for deletion", async () => {
      const { issue, editor, mag } = await fixture();
      await m.issues.updateIssueDetails(
        m,
        issue,
        { title: "Renamed before deletion" },
        issue.updatedAt,
        editor,
        false,
      );
      // The delete still holds the copy from before the other editor's save.
      await m.issues.deleteDraftIssue(m, issue, editor);
      expect(await history(mag.id)).toMatchObject([
        {
          detail: { event: "deleted" },
          issue: {
            id: null,
            number: Number(issue.number),
            title: "Renamed before deletion",
            status: null,
          },
        },
      ]);
    });

    it("many quick saves make one history line", async () => {
      const { c, issue, editor, mag } = await fixture();
      const save = async (current: MagazineIssue, who = editor) =>
        (
          await m.issues.setIssueItems(
            m,
            current,
            [editorialItem("Saved")],
            current.updatedAt,
            who,
          )
        ).issue;
      let saved = await save(issue);
      saved = await save(saved);
      expect(await history(mag.id)).toHaveLength(1);
      saved = await save(saved, actor(c));
      saved = await save(saved, actor(c));
      expect(await history(mag.id)).toHaveLength(2);
      const { sql } = await import("drizzle-orm");
      await m.db.execute(
        sql`UPDATE "app"."magazine_issue_history" SET "created_at" = CURRENT_TIMESTAMP - interval '61 minutes' WHERE "magazine_id" = ${mag.id}`,
      );
      saved = await save(saved, actor(c));
      expect(await history(mag.id)).toHaveLength(3);
      const rescheduled = await automatic(saved, editor);
      const stopped = await m.issues.unscheduleIssue(
        m,
        rescheduled,
        rescheduled.updatedAt,
        editor,
      );
      await save(stopped, actor(c));
      expect((await history(mag.id)).map((row) => row.detail.event)).toEqual([
        "items_changed",
        "auto_publish_stopped",
        "items_changed",
        "items_changed",
        "items_changed",
      ]);
    });

    it("creates a draft with the given layout and visibility", async () => {
      const c = await community("overrides");
      const mag = await magazineIn(c);
      const custom = await m.issues.createIssue(
        m,
        mag,
        { title: "Custom" },
        actor(c),
        {
          layout: "cover-story",
          visibility: {
            visibility: "public",
            publicConfirmedBy: fx.userId,
            publicConfirmedAt: at(0).toISOString(),
          },
        },
      );
      expect(custom).toMatchObject({
        status: "draft",
        layout: "cover-story",
        visibility: "public",
        publicConfirmedBy: fx.userId,
        publicConfirmedAt: at(0).toISOString(),
      });
      const plain = await m.issues.createIssue(
        m,
        mag,
        { title: "Default" },
        actor(c),
      );
      expect(plain).toMatchObject({
        layout: "cover-story",
        visibility: "members",
        publicConfirmedBy: null,
        publicConfirmedAt: null,
      });
    });

    it("lists the latest 30 history entries, including events without an issue", async () => {
      const { inPayloadTransaction } = await import("./payload-writes");
      const { recordIssueHistory } = await import("./issue-history");
      const mag = await magazineIn(await community("history-limit"));
      const other = await magazineIn(await community("history-other"), "other");
      await inPayloadTransaction(m.payload, async (tx) => {
        for (let found = 0; found < 32; found++) {
          await recordIssueHistory(
            tx,
            {
              magazineId: mag.id,
              issue: null,
              actorId: null,
              detail: {
                event: "draft_skipped",
                trigger: "schedule",
                reason: "too_few",
                found,
                needed: 40,
              },
            },
            at(0),
          );
        }
        await recordIssueHistory(
          tx,
          {
            magazineId: other.id,
            issue: null,
            actorId: null,
            detail: {
              event: "draft_skipped",
              trigger: "schedule",
              reason: "no_rights",
              found: null,
              needed: null,
            },
          },
          at(0),
        );
      });
      const rows = await history(mag.id);
      expect(rows).toHaveLength(30);
      expect(rows.map((row) => row.detail)).toEqual(
        Array.from({ length: 30 }, (_, index) => ({
          event: "draft_skipped",
          trigger: "schedule",
          reason: "too_few",
          found: 31 - index,
          needed: 40,
        })),
      );
      for (const row of rows) {
        expect(row).toMatchObject({
          actorName: null,
          issue: null,
          createdAt: at(0).toISOString(),
        });
      }
    });
  });

  // ── Magazine ──────────────────────────────────────────────────────────

  it("creates the magazine once per community and adds the Magazine tab", async () => {
    const c = await community("once", { defaultSpaces: true });

    // Two editors create at the same moment (preflight F4): the unique
    // community index lets one through. Hold the first create until both
    // callers have read: otherwise the second can legitimately update it.
    let creating = 0;
    let release!: () => void;
    const bothCreating = new Promise<void>((resolve) => {
      release = resolve;
    });
    const create = m.payload.create.bind(m.payload);
    const createSpy = vi
      .spyOn(m.payload, "create")
      .mockImplementation(async (args) => {
        if (args.collection === "magazines") {
          if (++creating === 2) release();
          await bothCreating;
        }
        return create(args);
      });
    const results = await Promise.allSettled([
      m.magazines.saveMagazineSettings(
        m,
        c,
        settings("first"),
        fx.userId,
        true,
      ),
      m.magazines.saveMagazineSettings(
        m,
        c,
        settings("second"),
        fx.userId,
        true,
      ),
    ]).finally(() => createSpy.mockRestore());
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason.message).toBe("MAGAZINE_EXISTS");

    // A later save updates the one magazine; topics are normalised.
    const updated = await m.magazines.saveMagazineSettings(
      m,
      c,
      settings("renamed", {
        topics: [" AI ", "ai", "Robots", "", "a", "b", "c", "d"],
      }),
      fx.userId,
      true,
    );
    expect(updated.name).toBe("Magazine renamed");
    expect((updated.topics ?? []).map((t) => t.topic)).toEqual([
      "ai",
      "robots",
      "a",
      "b",
      "c",
    ]);
    const { totalDocs } = await m.payload.count({
      collection: "magazines",
      where: { communityId: { equals: c.id } },
    });
    expect(totalDocs).toBe(1);

    const { eq, asc } = await import("drizzle-orm");
    const rows = await m.db
      .select()
      .from(m.schema.spaces)
      .where(eq(m.schema.spaces.communityId, c.id))
      .orderBy(asc(m.schema.spaces.position));
    const tabs = rows.filter((r) => r.builtinSurface === "magazine");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ kind: "builtin", slug: "magazine" });
    expect(rows.at(-1)!.slug).toBe("magazine");
    expect(tabs[0]!.position).toBeGreaterThan(
      Math.max(
        ...rows.filter((r) => r.slug !== "magazine").map((r) => r.position),
      ),
    );
  });

  it("a room called magazine blocks the tab with SPACE_SLUG_TAKEN instead of silently skipping", async () => {
    const c = await community("room");
    await m.db.insert(m.schema.spaces).values({
      communityId: c.id,
      kind: "room",
      name: "Magazine",
      slug: "magazine",
      visibility: "public",
      createdBy: fx.userId,
    });

    expect(await refusal(magazineIn(c))).toBe("SPACE_SLUG_TAKEN");
    // Checked before the magazine is created (preflight F15): no magazine
    // without a tab.
    expect(
      await m.magazines.getMagazineForCommunity(m.payload, c.id),
    ).toBeNull();
    expect(await refusal(m.magazines.ensureMagazineSpace(m.db, c.id))).toBe(
      "SPACE_SLUG_TAKEN",
    );
  });

  it("refuses a magazine slug another community uses", async () => {
    const a = await community("slug-a");
    const b = await community("slug-b");
    await m.magazines.saveMagazineSettings(
      m,
      a,
      settings("shared"),
      fx.userId,
      true,
    );
    expect(
      await refusal(
        m.magazines.saveMagazineSettings(
          m,
          b,
          settings("shared"),
          fx.userId,
          true,
        ),
      ),
    ).toBe("MAGAZINE_SLUG_TAKEN");
  });

  // ── Issues ────────────────────────────────────────────────────────────

  it("numbers issues per magazine and copies the default visibility and confirmation", async () => {
    const c = await community("numbers", { listed: false });
    const mag = await m.magazines.saveMagazineSettings(
      m,
      c,
      settings("numbers", {
        defaultVisibility: "public",
        confirmUnlistedPublic: true,
      }),
      fx.userId,
      true,
    );
    expect(mag.publicConfirmedBy).toBe(fx.userId);

    const first = await m.issues.createIssue(
      m,
      mag,
      { title: "Spring!" },
      actor(c),
    );
    const second = await m.issues.createIssue(
      m,
      mag,
      { title: "Spring!" },
      actor(c),
    );
    const third = await m.issues.createIssue(m, mag, { title: "?!" }, actor(c));

    expect([first, second, third].map((i) => Number(i.number))).toEqual([
      1, 2, 3,
    ]);
    expect([first, second, third].map((i) => i.slug)).toEqual([
      "spring",
      "spring-2",
      "issue-3",
    ]);
    for (const issue of [first, second, third]) {
      expect(issue.status).toBe("draft");
      expect(issue.communityId).toBe(c.id);
      expect(issue.visibility).toBe("public");
      expect(issue.publicConfirmedBy).toBe(fx.userId);
      expect(new Date(issue.publicConfirmedAt!).getTime()).toBe(
        new Date(mag.publicConfirmedAt!).getTime(),
      );
    }

    // Another magazine counts from 1.
    const other = await community("numbers-other");
    const otherMag = await magazineIn(other, "numbers-other");
    const otherFirst = await m.issues.createIssue(
      m,
      otherMag,
      { title: "Spring!" },
      actor(other),
    );
    expect(Number(otherFirst.number)).toBe(1);
    expect(otherFirst.visibility).toBe("members");
    expect(otherFirst.publicConfirmedBy ?? null).toBeNull();
  });

  it("public on an unlisted community needs confirmation, records who and when", async () => {
    const c = await community("confirm", { listed: false });

    expect(
      await refusal(
        m.magazines.saveMagazineSettings(
          m,
          c,
          settings("confirm", { defaultVisibility: "public" }),
          fx.userId,
          true,
        ),
      ),
    ).toBe("CONFIRM_UNLISTED_PUBLIC");

    const mag = await magazineIn(c, "confirm");
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Confirm" },
      actor(c),
    );

    expect(
      await refusal(
        m.issues.updateIssueDetails(
          m,
          issue,
          { visibility: "public" },
          issue.updatedAt,
          actor(c),
          true,
        ),
      ),
    ).toBe("CONFIRM_UNLISTED_PUBLIC");

    const before = Date.now();
    const confirmed = await m.issues.updateIssueDetails(
      m,
      issue,
      { visibility: "public", confirmUnlistedPublic: true },
      issue.updatedAt,
      actor(c),
      true,
    );
    expect(confirmed.visibility).toBe("public");
    expect(confirmed.publicConfirmedBy).toBe(fx.userId);
    expect(
      new Date(confirmed.publicConfirmedAt!).getTime(),
    ).toBeGreaterThanOrEqual(before - 1000);

    // Back to members clears the record, so public asks again.
    const members = await m.issues.updateIssueDetails(
      m,
      confirmed,
      { visibility: "members" },
      confirmed.updatedAt,
      actor(c),
      true,
    );
    expect(members.publicConfirmedBy ?? null).toBeNull();
    expect(members.publicConfirmedAt ?? null).toBeNull();
  });

  it("the services refuse a public confirmation by a non-leader", async () => {
    const c = await community("leaders-confirm", { listed: false });
    const mag = await magazineIn(c, "leaders-confirm");
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Private" },
      actor(c),
    );

    await expect(
      m.magazines.saveMagazineSettings(
        m,
        c,
        settings("leaders-confirm", {
          defaultVisibility: "public",
          confirmUnlistedPublic: true,
        }),
        fx.userId,
        false,
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "UNLISTED_PUBLIC_LEADERS_ONLY",
    });

    for (const patch of [
      { visibility: "public" as const, confirmUnlistedPublic: true },
      { title: "Still private", confirmUnlistedPublic: true },
    ]) {
      await expect(
        m.issues.updateIssueDetails(
          m,
          issue,
          patch,
          issue.updatedAt,
          actor(c),
          false,
        ),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "UNLISTED_PUBLIC_LEADERS_ONLY",
      });
    }
    expect(
      (
        await m.payload.findByID({
          collection: "magazine-issues",
          id: issue.id,
        })
      ).visibility,
    ).toBe("members");
  });

  it("stale expectedUpdatedAt is refused", async () => {
    const c = await community("stale");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Stale" },
      actor(c),
    );
    const saved = await setItems(c, issue, [editorialItem("first save")]);

    // A second tab still holds the issue from before that save.
    expect(
      await refusal(
        m.issues.setIssueItems(
          m,
          saved,
          [editorialItem("from the stale tab")],
          issue.updatedAt,
          actor(c),
        ),
      ),
    ).toBe("ISSUE_CHANGED");
    expect(
      await refusal(
        m.issues.updateIssueDetails(
          m,
          saved,
          { title: "Stale title" },
          issue.updatedAt,
          actor(c),
          true,
        ),
      ),
    ).toBe("ISSUE_CHANGED");

    // Two saves from the same copy at the same moment (preflight F21): the
    // row claim lets one through; the other is refused, not merged.
    const raced = await Promise.allSettled([
      m.issues.setIssueItems(
        m,
        saved,
        [editorialItem("tab A")],
        saved.updatedAt,
        actor(c),
      ),
      m.issues.setIssueItems(
        m,
        saved,
        [editorialItem("tab B")],
        saved.updatedAt,
        actor(c),
      ),
    ]);
    const won = raced.filter((r) => r.status === "fulfilled");
    const lost = raced.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]!.reason.message).toBe("ISSUE_CHANGED");

    const stored = await m.payload.findByID({
      collection: "magazine-issues",
      id: issue.id,
      depth: 0,
    });
    const winner = won[0]!.value.issue;
    expect(stored.items).toHaveLength(1);
    expect((stored.items![0] as { heading?: string }).heading).toBe(
      (winner.items![0] as { heading?: string }).heading,
    );
  });

  it("places and unplaces articles as the item list changes", async () => {
    const c = await community("place");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Place" },
      actor(c),
    );
    const a1 = await article("a1", mag.id);
    const a2 = await article("a2", mag.id);

    const both = await setItems(c, issue, [articleItem(a1), articleItem(a2)]);
    for (const id of [a1, a2]) {
      expect(await placementOf(id, false)).toBe(issue.id);
      expect(await placementOf(id, true)).toBe(issue.id);
    }
    const a2BlockId = both.items![1]!.id!;

    // The client keeps a2's block id; a1 leaves the list.
    const one = await setItems(c, both, [articleItem(a2, a2BlockId)]);
    expect(one.items!.map((b) => b.id)).toEqual([a2BlockId]);
    expect(await placementOf(a1, false)).toBeNull();
    expect(await placementOf(a1, true)).toBeNull();
    expect(await placementOf(a2, false)).toBe(issue.id);

    // A repeated id and another issue's id are replaced, not a DB error.
    const other = await m.issues.createIssue(
      m,
      mag,
      { title: "Other" },
      actor(c),
    );
    const otherSaved = await setItems(c, other, [editorialItem("theirs")]);
    const foreignId = otherSaved.items![0]!.id!;
    const resaved = await setItems(c, one, [
      articleItem(a2, a2BlockId),
      { ...editorialItem("dup"), id: a2BlockId },
      { ...editorialItem("foreign"), id: foreignId },
    ]);
    const ids = resaved.items!.map((b) => b.id);
    expect(ids[0]).toBe(a2BlockId);
    expect(new Set(ids).size).toBe(3);
    expect(ids).not.toContain(foreignId);

    // Clearing the list unplaces everything.
    await setItems(c, resaved, []);
    expect(await placementOf(a2, false)).toBeNull();
  });

  it("an article cannot be in two issues", async () => {
    const c = await community("two");
    const mag = await magazineIn(c);
    const first = await m.issues.createIssue(
      m,
      mag,
      { title: "One" },
      actor(c),
    );
    const second = await m.issues.createIssue(
      m,
      mag,
      { title: "Two" },
      actor(c),
    );
    const a = await article("shared", mag.id);

    await setItems(c, first, [articleItem(a)]);
    const err = await m.issues
      .setIssueItems(
        m,
        second,
        [editorialItem("opener"), articleItem(a)],
        second.updatedAt,
        actor(c),
      )
      .catch((e: unknown) => e);
    expect((err as Error).message).toBe("ARTICLE_PLACED");
    const { magazineErrorItemIndex } = await import("./errors");
    expect(magazineErrorItemIndex(err as never)).toBe(1);
    expect(await placementOf(a, false)).toBe(first.id);
  });

  it("refuses to delete an article an issue holds, and allows it once removed", async () => {
    const c = await community("delete-article");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Holds" },
      actor(c),
    );
    const a = await article("held", mag.id);
    const saved = await setItems(c, issue, [articleItem(a)]);

    expect(
      await refusal(m.placement.assertArticleNotPlaced(m.payload, a)),
    ).toBe("ARTICLE_PLACED");
    // Every delete path, the Payload admin included, gets the same refusal
    // (Articles beforeDelete hook), not a raw foreign-key error.
    expect(
      await refusal(m.payload.delete({ collection: "articles", id: a })),
    ).toBe("ARTICLE_PLACED");

    await setItems(c, saved, []);
    await expect(
      m.placement.assertArticleNotPlaced(m.payload, a),
    ).resolves.toBeUndefined();
    await m.payload.delete({ collection: "articles", id: a });
    const { totalDocs } = await m.payload.count({
      collection: "articles",
      where: { id: { equals: a } },
    });
    expect(totalDocs).toBe(0);
  });

  it("deletes a draft issue and clears its placements; a published one stays", async () => {
    const c = await community("delete-issue");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Gone" },
      actor(c),
    );
    const a = await article("gone", mag.id);
    await setItems(c, issue, [articleItem(a)]);

    await m.issues.deleteDraftIssue(m, issue, actor(c));
    expect(await placementOf(a, false)).toBeNull();
    const { totalDocs } = await m.payload.count({
      collection: "magazine-issues",
      where: { id: { equals: issue.id } },
    });
    expect(totalDocs).toBe(0);

    const kept = await m.issues.createIssue(
      m,
      mag,
      { title: "Kept" },
      actor(c),
    );
    const filled = await setItems(c, kept, [articleItem(a)]);
    const published = await m.issues.publishIssue(
      m,
      filled,
      filled.updatedAt,
      actor(c),
    );
    expect(
      await refusal(m.issues.deleteDraftIssue(m, published, actor(c))),
    ).toBe("ISSUE_NOT_DRAFT");
    // A stale draft copy of an issue that was published meanwhile.
    expect(await refusal(m.issues.deleteDraftIssue(m, filled, actor(c)))).toBe(
      "ISSUE_NOT_DRAFT",
    );
  });

  // ── Scheduling and publication ────────────────────────────────────────

  async function readyIssue(label: string) {
    const c = await community(label);
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: label },
      actor(c),
    );
    const articleId = await article(label, mag.id);
    const filled = await setItems(c, issue, [articleItem(articleId)]);
    return { c, mag, filled, articleId };
  }

  function storedIssue(issueId: number) {
    return m.payload.findByID({
      collection: "magazine-issues",
      id: issueId,
      depth: 0,
    });
  }

  async function announcementsFor(issueId: number) {
    const { eq } = await import("drizzle-orm");
    return m.db
      .select()
      .from(m.schema.magazineIssueAnnouncements)
      .where(eq(m.schema.magazineIssueAnnouncements.issueId, issueId));
  }

  const scheduleNow = new Date("2026-10-27T12:00:00Z");
  const nextDay = new Date("2026-10-28T12:00:00Z");

  it("schedules a draft and can move the time", async () => {
    const { c, filled, articleId } = await readyIssue("schedule");
    const scheduled = await m.issues.scheduleIssue(
      m,
      filled,
      nextDay,
      filled.updatedAt,
      actor(c),
      scheduleNow,
    );
    expect(scheduled).toMatchObject({
      status: "scheduled",
      scheduledFor: nextDay.toISOString(),
      scheduledBy: fx.userId,
    });
    const later = new Date("2026-10-29T12:00:00Z");
    const moved = await m.issues.scheduleIssue(
      m,
      scheduled,
      later,
      scheduled.updatedAt,
      actor(c),
      scheduleNow,
    );
    expect(moved.scheduledFor).toBe(later.toISOString());
    expect(await storedIssue(filled.id)).toMatchObject({
      status: "scheduled",
      scheduledFor: later.toISOString(),
      scheduledBy: fx.userId,
    });
    const held = await m.payload.findByID({
      collection: "articles",
      id: articleId,
      depth: 0,
    });
    expect(held.status).toBe("draft");
    expect(await announcementsFor(filled.id)).toEqual([]);
  });

  it("refuses to schedule a past time, a time over a year away, an empty or a published issue", async () => {
    const { c, mag, filled } = await readyIssue("schedule-refused");
    const empty = await m.issues.createIssue(
      m,
      mag,
      { title: "Empty" },
      actor(c),
    );
    const published = await m.issues.publishIssue(
      m,
      filled,
      filled.updatedAt,
      actor(c),
    );
    const cases = [
      [empty, scheduleNow, "SCHEDULE_IN_PAST"],
      [empty, new Date("2027-10-28T12:00:00Z"), "SCHEDULE_TOO_FAR"],
      [empty, nextDay, "ISSUE_EMPTY"],
      [published, nextDay, "ISSUE_NOT_DRAFT"],
    ] as const;
    for (const [issue, time, code] of cases) {
      const before = await storedIssue(issue.id);
      expect(
        await refusal(
          m.issues.scheduleIssue(
            m,
            issue,
            time,
            issue.updatedAt,
            actor(c),
            scheduleNow,
          ),
        ),
      ).toBe(code);
      expect(await storedIssue(issue.id)).toEqual(before);
    }
  });

  it("refuses to schedule an issue whose article is no longer ready", async () => {
    const { c, filled, articleId } = await readyIssue("schedule-invalid");
    await m.payload.update({
      collection: "articles",
      id: articleId,
      data: { reviewStatus: "pending_review" },
    });
    expect(
      await refusal(
        m.issues.scheduleIssue(
          m,
          filled,
          nextDay,
          filled.updatedAt,
          actor(c),
          scheduleNow,
        ),
      ),
    ).toBe("ARTICLE_NOT_READY");
    expect(await storedIssue(filled.id)).toEqual(filled);
  });

  it("a scheduled issue can still be edited, but not deleted", async () => {
    const { c, filled, articleId } = await readyIssue("schedule-edit");
    const scheduled = await m.issues.scheduleIssue(
      m,
      filled,
      nextDay,
      filled.updatedAt,
      actor(c),
      scheduleNow,
    );
    const saved = await setItems(c, scheduled, [
      articleItem(articleId, scheduled.items![0]!.id!),
      editorialItem("Later news"),
    ]);
    const renamed = await m.issues.updateIssueDetails(
      m,
      saved,
      { title: "Updated while scheduled" },
      saved.updatedAt,
      actor(c),
      true,
    );
    expect(renamed).toMatchObject({
      title: "Updated while scheduled",
      status: "scheduled",
      scheduledFor: nextDay.toISOString(),
      scheduledBy: fx.userId,
    });
    expect(renamed.items).toHaveLength(2);
    expect(await refusal(m.issues.deleteDraftIssue(m, renamed, actor(c)))).toBe(
      "ISSUE_NOT_DRAFT",
    );
    expect(await storedIssue(renamed.id)).toEqual(renamed);
  });

  it("unscheduling makes it a draft again", async () => {
    const { c, filled } = await readyIssue("unschedule");
    expect(
      await refusal(
        m.issues.unscheduleIssue(m, filled, filled.updatedAt, actor(c)),
      ),
    ).toBe("ISSUE_NOT_SCHEDULED");
    const scheduled = await m.issues.scheduleIssue(
      m,
      filled,
      nextDay,
      filled.updatedAt,
      actor(c),
      scheduleNow,
    );
    const renamed = await m.issues.updateIssueDetails(
      m,
      scheduled,
      { title: "Newer edit" },
      scheduled.updatedAt,
      actor(c),
      true,
    );
    expect(
      await refusal(
        m.issues.unscheduleIssue(m, scheduled, scheduled.updatedAt, null),
      ),
    ).toBe("ISSUE_CHANGED");
    expect(await storedIssue(filled.id)).toEqual(renamed);
    const draft = await m.issues.unscheduleIssue(
      m,
      renamed,
      renamed.updatedAt,
      null,
    );
    expect(draft).toMatchObject({
      status: "draft",
      scheduledFor: null,
      scheduledBy: null,
    });
    expect(await storedIssue(filled.id)).toEqual(draft);
  });

  it("publishing records how and when it went out", async () => {
    const { c, mag, filled } = await readyIssue("publish-origin");
    const time = new Date("2026-10-27T14:30:00Z");
    const published = await m.issues.publishIssue(
      m,
      filled,
      filled.updatedAt,
      actor(c),
      { origin: "schedule", now: time },
    );
    expect(published).toMatchObject({
      publishedVia: "schedule",
      publishedAt: time.toISOString(),
    });
    const second = await m.issues.createIssue(
      m,
      mag,
      { title: "By button" },
      actor(c),
    );
    const ready = await setItems(c, second, [editorialItem("Another issue")]);
    const byButton = await m.issues.publishIssue(
      m,
      ready,
      ready.updatedAt,
      actor(c),
    );
    expect(byButton.publishedVia).toBe("button");
  });

  it("publishing a scheduled issue clears the schedule and records one announcement", async () => {
    const { c, mag, filled, articleId } = await readyIssue("publish-scheduled");
    const scheduled = await m.issues.scheduleIssue(
      m,
      filled,
      nextDay,
      filled.updatedAt,
      actor(c),
      scheduleNow,
    );
    const published = await m.issues.publishIssue(
      m,
      scheduled,
      scheduled.updatedAt,
      actor(c),
      { origin: "schedule", now: nextDay },
    );
    expect(published).toMatchObject({
      status: "published",
      scheduledFor: null,
      scheduledBy: null,
    });
    const rows = await announcementsFor(filled.id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.magazineId)).toBe(mag.id);
    expect(rows[0]!.publishedAt.toISOString()).toBe(published.publishedAt);
    await setItems(c, published, [
      articleItem(articleId, published.items![0]!.id!),
    ]);
    expect(await announcementsFor(filled.id)).toEqual(rows);
  });

  it("a publish that fails records no announcement", async () => {
    const { c, filled } = await readyIssue("publish-stale");
    const renamed = await m.issues.updateIssueDetails(
      m,
      filled,
      { title: "Newer draft" },
      filled.updatedAt,
      actor(c),
      true,
    );
    expect(
      await refusal(
        m.issues.publishIssue(m, filled, filled.updatedAt, actor(c)),
      ),
    ).toBe("ISSUE_CHANGED");
    expect(await storedIssue(filled.id)).toEqual(renamed);
    expect(await announcementsFor(filled.id)).toEqual([]);
  });

  it("publish publishes and credits placed articles once", async () => {
    const c = await community("publish");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Publish" },
      actor(c),
    );
    const a = await article("published", mag.id);
    const filled = await setItems(c, issue, [
      articleItem(a),
      editorialItem("note"),
    ]);

    const xpBefore = await xpOf(fx.userId);
    expect(await m.writerMetric(fx.userId)).toBe(0);

    const published = await m.issues.publishIssue(
      m,
      filled,
      filled.updatedAt,
      actor(c),
    );
    expect(published.status).toBe("published");
    expect(published.publishedBy).toBe(fx.userId);
    expect(published.publishedAt).toBeTruthy();

    const doc = await m.payload.findByID({
      collection: "articles",
      id: a,
      depth: 0,
    });
    expect(doc.status).toBe("published");
    expect(doc.publishedAt).toBeTruthy();
    expect(await xpOf(fx.userId)).toBe(xpBefore + m.xpArticlePublished);
    expect(await pointsEventCount(fx.userId)).toBe(1);
    expect(await m.writerMetric(fx.userId)).toBe(1);

    // A second publish is refused; nothing is credited again.
    expect(
      await refusal(
        m.issues.publishIssue(m, published, published.updatedAt, actor(c)),
      ),
    ).toBe("ISSUE_NOT_DRAFT");
    // A save of the published issue publishes nothing new.
    await setItems(c, published, [articleItem(a, published.items![0]!.id!)]);
    expect(await xpOf(fx.userId)).toBe(xpBefore + m.xpArticlePublished);
    expect(await pointsEventCount(fx.userId)).toBe(1);
  });

  it("adding an article to a published issue publishes and credits it", async () => {
    const c = await community("late");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Late" },
      actor(c),
    );
    const filled = await setItems(c, issue, [editorialItem("opener")]);
    const published = await m.issues.publishIssue(
      m,
      filled,
      filled.updatedAt,
      actor(c),
    );
    const a = await article("late", mag.id);

    const xpBefore = await xpOf(fx.userId);
    await setItems(c, published, [
      { ...editorialItem("opener"), id: published.items![0]!.id! },
      articleItem(a),
    ]);
    const doc = await m.payload.findByID({
      collection: "articles",
      id: a,
      depth: 0,
    });
    expect(doc.status).toBe("published");
    expect(await xpOf(fx.userId)).toBe(xpBefore + m.xpArticlePublished);
  });

  it("publish shows the latest draft content to readers", async () => {
    const c = await community("latest");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Latest" },
      actor(c),
    );
    const a = await article("latest", mag.id);
    // Edited as a Payload draft version after approval.
    await m.payload.update({
      collection: "articles",
      id: a,
      draft: true,
      data: { title: "latest edited text", content: richText("edited body") },
    });
    const filled = await setItems(c, issue, [articleItem(a)]);
    await m.issues.publishIssue(m, filled, filled.updatedAt, actor(c));

    const live = await m.payload.findByID({
      collection: "articles",
      id: a,
      depth: 0,
      draft: false,
    });
    expect(live.status).toBe("published");
    expect(live.title).toBe("latest edited text");
    expect(JSON.stringify(live.content)).toContain("edited body");
  });

  it("moving a published article does not credit twice and drops the old placement", async () => {
    const c = await community("move");
    const mag = await magazineIn(c);
    const issueA = await m.issues.createIssue(
      m,
      mag,
      { title: "Issue A" },
      actor(c),
    );
    const a = await article("moved", mag.id);
    const filledA = await setItems(c, issueA, [
      articleItem(a),
      editorialItem("stays in A"),
    ]);
    const publishedA = await m.issues.publishIssue(
      m,
      filledA,
      filledA.updatedAt,
      actor(c),
    );
    const xpAfterFirst = await xpOf(fx.userId);

    // Out of A (keeping A's editorial), into B, publish B.
    const trimmedA = await setItems(c, publishedA, [
      {
        ...editorialItem("stays in A"),
        id: publishedA.items![1]!.id!,
      },
    ]);
    const issueB = await m.issues.createIssue(
      m,
      mag,
      { title: "Issue B" },
      actor(c),
    );
    const filledB = await setItems(c, issueB, [articleItem(a)]);
    await m.issues.publishIssue(m, filledB, filledB.updatedAt, actor(c));

    expect(await xpOf(fx.userId)).toBe(xpAfterFirst);
    expect(await pointsEventCount(fx.userId)).toBe(1);
    expect(await placementOf(a, false)).toBe(issueB.id);

    const readerViews = await m.registry.loadIssueItemViews(
      (trimmedA.items ?? []) as Registry.StoredBlock[],
      itemContextFor(m, {
        magazineId: mag.id,
        community: c,
        issueId: issueA.id,
        locale: "en",
        access: "full",
        viewerId: fx.userId,
      }),
    );
    expect(readerViews.map((v) => v.kind)).toEqual(["editorial"]);
  });

  it("refuses to publish an empty issue or one with an invalid item", async () => {
    const c = await community("refuse");
    const mag = await magazineIn(c);
    const empty = await m.issues.createIssue(
      m,
      mag,
      { title: "Empty" },
      actor(c),
    );
    expect(
      await refusal(m.issues.publishIssue(m, empty, empty.updatedAt, actor(c))),
    ).toBe("ISSUE_EMPTY");

    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Invalid" },
      actor(c),
    );
    const a = await article("not-ready", mag.id);
    const filled = await setItems(c, issue, [
      editorialItem("opener"),
      articleItem(a),
    ]);
    // The author asks for changes back after it was placed.
    await m.payload.update({
      collection: "articles",
      id: a,
      data: { reviewStatus: "pending_review" },
    });
    const err = await m.issues
      .publishIssue(m, filled, filled.updatedAt, actor(c))
      .catch((e: unknown) => e);
    expect((err as Error).message).toBe("ARTICLE_NOT_READY");
    const { magazineErrorItemIndex } = await import("./errors");
    expect(magazineErrorItemIndex(err as never)).toBe(1);

    const stored = await m.payload.findByID({
      collection: "magazine-issues",
      id: issue.id,
      depth: 0,
    });
    expect(stored.status).toBe("draft");
    const doc = await m.payload.findByID({
      collection: "articles",
      id: a,
      depth: 0,
    });
    expect(doc.status).toBe("draft");
  });

  it("locks the slug once published", async () => {
    const c = await community("slug");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Slug lock" },
      actor(c),
    );

    const renamed = await m.issues.updateIssueDetails(
      m,
      issue,
      { slug: "renamed-slug" },
      issue.updatedAt,
      actor(c),
      true,
    );
    expect(renamed.slug).toBe("renamed-slug");

    const taken = await m.issues.createIssue(
      m,
      mag,
      { title: "Taken" },
      actor(c),
    );
    expect(
      await refusal(
        m.issues.updateIssueDetails(
          m,
          taken,
          { slug: "renamed-slug" },
          taken.updatedAt,
          actor(c),
          true,
        ),
      ),
    ).toBe("ISSUE_SLUG_TAKEN");

    const filled = await setItems(c, renamed, [editorialItem("opener")]);
    const published = await m.issues.publishIssue(
      m,
      filled,
      filled.updatedAt,
      actor(c),
    );
    expect(
      await refusal(
        m.issues.updateIssueDetails(
          m,
          published,
          { slug: "another-slug" },
          published.updatedAt,
          actor(c),
          true,
        ),
      ),
    ).toBe("ISSUE_SLUG_LOCKED");
    // The same slug, or a title edit, is not a slug change.
    const retitled = await m.issues.updateIssueDetails(
      m,
      published,
      { slug: "renamed-slug", title: "New title" },
      published.updatedAt,
      actor(c),
      true,
    );
    expect(retitled.title).toBe("New title");
  });
  it("concurrent creates with the same title get the next free number and slug", async () => {
    const c = await community("race-create");
    const mag = await magazineIn(c);
    const created = await Promise.all(
      [1, 2, 3].map(() =>
        m.issues.createIssue(m, mag, { title: "Same title" }, actor(c)),
      ),
    );
    expect(created.map((i) => Number(i.number)).sort()).toEqual([1, 2, 3]);
    expect(new Set(created.map((i) => i.slug)).size).toBe(3);
    expect(created.map((i) => i.slug)).toContain("same-title");
  });

  it("moving a published article with a pending draft edit never pushes the edit live", async () => {
    const c = await community("pending");
    const mag = await magazineIn(c);
    const issueA = await m.issues.createIssue(m, mag, { title: "A" }, actor(c));
    const a = await article("pending", mag.id);
    const filledA = await setItems(c, issueA, [
      articleItem(a),
      editorialItem("stays in A"),
    ]);
    const publishedA = await m.issues.publishIssue(
      m,
      filledA,
      filledA.updatedAt,
      actor(c),
    );

    // The author starts an edit, saved as a draft version only.
    await m.payload.update({
      collection: "articles",
      id: a,
      draft: true,
      data: { title: "pending edit", content: richText("pending body") },
    });
    const live = async () =>
      m.payload.findByID({
        collection: "articles",
        id: a,
        depth: 0,
        draft: false,
      });

    // Removed from A, placed in B, then removed from B.
    const trimmedA = await setItems(c, publishedA, [
      { ...editorialItem("stays in A"), id: publishedA.items![1]!.id! },
    ]);
    expect(trimmedA.items).toHaveLength(1);
    const issueB = await m.issues.createIssue(m, mag, { title: "B" }, actor(c));
    const filledB = await setItems(c, issueB, [articleItem(a)]);
    expect(await placementOf(a, false)).toBe(issueB.id);
    expect((await live()).title).toBe("pending first text");

    // A refusal saved as a draft version: the live row must stay approved.
    await m.payload.update({
      collection: "articles",
      id: a,
      draft: true,
      data: { reviewStatus: "changes_requested" },
    });
    await setItems(c, filledB, []);
    expect(await placementOf(a, false)).toBeNull();
    expect(await placementOf(a, true)).toBeNull();

    const after = await live();
    expect(after.title).toBe("pending first text");
    expect(JSON.stringify(after.content)).not.toContain("pending body");
    expect(after.status).toBe("published");
    expect(after.reviewStatus).toBe("approved");
    // The pending edit is still there for the author.
    const latest = await m.payload.findByID({
      collection: "articles",
      id: a,
      depth: 0,
      draft: true,
    });
    expect(latest.title).toBe("pending edit");
  });

  // ── Credit ────────────────────────────────────────────────────────────

  it("publishing credits contributors on publish only and gives the badge once", async () => {
    const { and, eq, sql } = await import("drizzle-orm");
    const { reviewMagazineArticle } = await import("./article-review");
    const { db, schema } = m;
    const c = await community("contributor-credit");
    const mag = await magazineIn(c);
    const contributorId = `isv-contributor-${fx.sfx}`;
    fx.userIds.push(contributorId);
    await db.insert(schema.user).values({
      id: contributorId,
      email: `${contributorId}@example.test`,
      name: "Contributor",
    });
    await db.insert(schema.memberProfiles).values({
      userId: contributorId,
      displayName: "Contributor",
    });
    await db.insert(schema.communityMemberships).values([
      { communityId: c.id, userId: fx.userId, role: "owner" },
      { communityId: c.id, userId: contributorId, role: "member" },
    ]);
    await db.insert(schema.magazineStaff).values({
      magazineId: mag.id,
      communityId: c.id,
      userId: contributorId,
      role: "contributor",
      assignedBy: fx.userId,
    });
    const badges = () =>
      db
        .select()
        .from(schema.memberBadges)
        .where(
          and(
            eq(schema.memberBadges.userId, contributorId),
            eq(schema.memberBadges.badgeSlug, "magazine_published"),
          ),
        );
    const notices = () =>
      db
        .select()
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.userId, contributorId),
            eq(schema.notifications.type, "badge_earned"),
            sql`${schema.notifications.metadata}->>'badgeSlug' = 'magazine_published'`,
          ),
        );
    const xpBefore = await xpOf(contributorId);
    const articleIds: number[] = [];
    for (const label of ["first", "second"]) {
      const id = await article(`contributor-${label}`, mag.id, {
        authorId: contributorId,
        authorName: "Contributor",
        reviewStatus: "pending_review",
      });
      articleIds.push(id);
      await reviewMagazineArticle(
        m,
        mag,
        { articleId: id, decision: "approve" },
        actor(c),
      );
    }
    expect(await xpOf(contributorId)).toBe(xpBefore);
    expect(await pointsEventCount(contributorId)).toBe(0);
    expect(await badges()).toEqual([]);
    expect(await notices()).toEqual([]);

    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Contributors" },
      actor(c),
    );
    const filled = await setItems(
      c,
      issue,
      articleIds.map((id) => articleItem(id)),
    );
    const published = await m.issues.publishIssue(
      m,
      filled,
      filled.updatedAt,
      actor(c),
    );
    expect(await xpOf(contributorId)).toBe(xpBefore + 2 * m.xpArticlePublished);
    expect(await pointsEventCount(contributorId)).toBe(2);
    expect(await badges()).toHaveLength(1);
    expect(await notices()).toHaveLength(1);
    for (const id of articleIds) expect(await isCredited(id)).toBe(true);

    await m.issues.updateIssueDetails(
      m,
      published,
      { title: "Contributors revised" },
      published.updatedAt,
      actor(c),
      true,
    );
    expect(await xpOf(contributorId)).toBe(xpBefore + 2 * m.xpArticlePublished);
    expect(await pointsEventCount(contributorId)).toBe(2);
    expect(await badges()).toHaveLength(1);
    expect(await notices()).toHaveLength(1);
  });

  it("a failed magazine badge preserves committed credit and the backfill recovers it quietly", async () => {
    const { and, eq, sql } = await import("drizzle-orm");
    const { runBadgeBackfill } = await import("@/server/badges/backfill");
    const { db, schema } = m;
    const c = await community("badge-retry");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Badge retry" },
      actor(c),
    );
    const a = await article("badge-retry", mag.id);
    const filled = await setItems(c, issue, [articleItem(a)]);
    const xpBefore = await xpOf(fx.userId);
    const fn = `magazine_badge_fail_${fx.sfx.replaceAll("-", "_")}`;
    const ddl = (statement: string) => db.execute(sql.raw(statement));
    const dropTrigger = async () => {
      await ddl(`DROP TRIGGER IF EXISTS ${fn} ON "app"."member_badge"`);
      await ddl(`DROP FUNCTION IF EXISTS "app".${fn}()`);
    };
    const badges = () =>
      db
        .select()
        .from(schema.memberBadges)
        .where(
          and(
            eq(schema.memberBadges.userId, fx.userId),
            eq(schema.memberBadges.badgeSlug, "magazine_published"),
          ),
        );
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      await ddl(`CREATE FUNCTION "app".${fn}() RETURNS trigger AS $$
        BEGIN
          IF NEW.user_id = '${fx.userId}' AND NEW.badge_slug = 'magazine_published' THEN
            RAISE EXCEPTION 'test: magazine badge refused';
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`);
      await ddl(`CREATE TRIGGER ${fn} BEFORE INSERT ON "app"."member_badge"
        FOR EACH ROW EXECUTE FUNCTION "app".${fn}()`);
      const published = await m.issues.publishIssue(
        m,
        filled,
        filled.updatedAt,
        actor(c),
      );
      expect(published.status).toBe("published");
      expect(await isCredited(a)).toBe(true);
      expect(await xpOf(fx.userId)).toBe(xpBefore + m.xpArticlePublished);
      expect(await pointsEventCount(fx.userId)).toBe(1);
      expect(await badges()).toEqual([]);
      expect(logged).toHaveBeenCalledWith(
        `badges: awarding magazine_published to ${fx.userId} failed`,
        expect.anything(),
      );
      await dropTrigger();
      const report = await runBadgeBackfill(
        { db, payload: async () => m.payload },
        { apply: true, userIds: [fx.userId] },
      );
      expect(report.failures).toEqual([]);
      expect(report.inserted).toBe(1);
      expect((await badges())[0]?.seenAt).toBeInstanceOf(Date);
      expect(await xpOf(fx.userId)).toBe(xpBefore + m.xpArticlePublished);
      const notices = await db
        .select()
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.userId, fx.userId),
            eq(schema.notifications.type, "badge_earned"),
            sql`${schema.notifications.metadata}->>'badgeSlug' = 'magazine_published'`,
          ),
        );
      expect(notices).toEqual([]);
    } finally {
      await dropTrigger();
      logged.mockRestore();
    }
  });

  it("a failed credit never fails the publish, leaves no XP, and the next save credits once", async () => {
    const c = await community("credit-retry");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Retry" },
      actor(c),
    );
    const a = await article("retry", mag.id);
    const filled = await setItems(c, issue, [articleItem(a)]);
    const xpBefore = await xpOf(fx.userId);

    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    creditFault.failNext = 1;
    const published = await m.issues.publishIssue(
      m,
      filled,
      filled.updatedAt,
      actor(c),
    );
    expect(published.status).toBe("published");
    expect(
      (await m.payload.findByID({ collection: "articles", id: a, depth: 0 }))
        .status,
    ).toBe("published");
    // The credit ran (XP written) and then threw: all of it rolled back.
    expect(creditFault.failNext).toBe(0);
    expect(logged).toHaveBeenCalledWith(
      "[magazines] article credit failed; will retry",
      expect.objectContaining({ articleId: a, magazineId: mag.id }),
    );
    logged.mockRestore();
    expect(await isCredited(a)).toBe(false);
    expect(await xpOf(fx.userId)).toBe(xpBefore);
    expect(await pointsEventCount(fx.userId)).toBe(0);

    // The next editor action settles it, once.
    const resaved = await setItems(c, published, [
      articleItem(a, published.items![0]!.id!),
    ]);
    expect(await xpOf(fx.userId)).toBe(xpBefore + m.xpArticlePublished);
    expect(await pointsEventCount(fx.userId)).toBe(1);
    expect(await isCredited(a)).toBe(true);

    await setItems(c, resaved, [articleItem(a, resaved.items![0]!.id!)]);
    expect(await pointsEventCount(fx.userId)).toBe(1);

    // A later Payload save of the article cannot touch the claim (Payload
    // never reads or writes its table), so nothing credits it again.
    await m.payload.update({
      collection: "articles",
      id: a,
      data: { title: "typo fixed" },
    });
    expect(await isCredited(a)).toBe(true);
    await m.publication.creditPendingMagazineArticles(m, mag.id);
    expect(await pointsEventCount(fx.userId)).toBe(1);
  });

  it("concurrent credit runs credit an article once", async () => {
    const c = await community("credit-race");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Race" },
      actor(c),
    );
    const a = await article("race", mag.id);
    const filled = await setItems(c, issue, [articleItem(a)]);
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    creditFault.failNext = 1;
    await m.issues.publishIssue(m, filled, filled.updatedAt, actor(c));
    logged.mockRestore();
    expect(await pointsEventCount(fx.userId)).toBe(0);

    const runs = await Promise.all([
      m.publication.creditPendingMagazineArticles(m, mag.id),
      m.publication.creditPendingMagazineArticles(m, mag.id),
      m.publication.creditPendingMagazineArticles(m, mag.id),
    ]);
    expect(runs.flatMap((r) => r.credited)).toEqual([a]);
    expect(runs.flatMap((r) => r.failed)).toEqual([]);
    expect(await pointsEventCount(fx.userId)).toBe(1);
  });
  it("a failed credit is still retried after the article moved to another issue", async () => {
    const c = await community("credit-moved");
    const mag = await magazineIn(c);
    const issueA = await m.issues.createIssue(m, mag, { title: "A" }, actor(c));
    const a = await article("credit-moved", mag.id);
    const filledA = await setItems(c, issueA, [
      articleItem(a),
      editorialItem("stays in A"),
    ]);
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    creditFault.failNext = 1;
    const publishedA = await m.issues.publishIssue(
      m,
      filledA,
      filledA.updatedAt,
      actor(c),
    );
    logged.mockRestore();
    expect(await isCredited(a)).toBe(false);
    expect(await pointsEventCount(fx.userId)).toBe(0);

    // The editor moves the article out of A before anything retried it.
    await setItems(c, publishedA, [
      { ...editorialItem("stays in A"), id: publishedA.items![1]!.id! },
    ]);
    // A's own save already retried it: pending is a property of the
    // article, not of the issue it sits in now.
    expect(await isCredited(a)).toBe(true);
    expect(await pointsEventCount(fx.userId)).toBe(1);

    // Placed in another published issue later: still credited once.
    const issueB = await m.issues.createIssue(m, mag, { title: "B" }, actor(c));
    const filledB = await setItems(c, issueB, [editorialItem("B opener")]);
    const publishedB = await m.issues.publishIssue(
      m,
      filledB,
      filledB.updatedAt,
      actor(c),
    );
    await setItems(c, publishedB, [
      { ...editorialItem("B opener"), id: publishedB.items![0]!.id! },
      articleItem(a),
    ]);
    expect(await pointsEventCount(fx.userId)).toBe(1);
  });

  it("a failed credit of an article that left every issue is retried by any save of a published issue of the magazine", async () => {
    const c = await community("credit-left");
    const mag = await magazineIn(c);
    const issueA = await m.issues.createIssue(m, mag, { title: "A" }, actor(c));
    const issueB = await m.issues.createIssue(m, mag, { title: "B" }, actor(c));
    const filledB = await setItems(c, issueB, [editorialItem("B")]);
    const publishedB = await m.issues.publishIssue(
      m,
      filledB,
      filledB.updatedAt,
      actor(c),
    );
    const a = await article("credit-left", mag.id);
    const filledA = await setItems(c, issueA, [
      articleItem(a),
      editorialItem("A"),
    ]);
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    // Fail the publish's credit AND the retry run by A's next save.
    creditFault.failNext = 2;
    const publishedA = await m.issues.publishIssue(
      m,
      filledA,
      filledA.updatedAt,
      actor(c),
    );
    await setItems(c, publishedA, [
      { ...editorialItem("A"), id: publishedA.items![1]!.id! },
    ]);
    logged.mockRestore();
    expect(await livePlacementOf(a)).toBeNull();
    expect(await isCredited(a)).toBe(false);
    expect(await pointsEventCount(fx.userId)).toBe(0);

    // A details save of ANOTHER published issue of the magazine settles it.
    const renamedB = await m.issues.updateIssueDetails(
      m,
      publishedB,
      { title: "B renamed" },
      publishedB.updatedAt,
      actor(c),
      true,
    );
    expect(await isCredited(a)).toBe(true);
    expect(await pointsEventCount(fx.userId)).toBe(1);

    // Exactly once: later saves of either issue, and a new issue's
    // publish, find nothing pending.
    await m.issues.updateIssueDetails(
      m,
      renamedB,
      { title: "B again" },
      renamedB.updatedAt,
      actor(c),
      true,
    );
    const latestA = await m.payload.findByID({
      collection: "magazine-issues",
      id: publishedA.id,
      depth: 0,
    });
    await m.issues.updateIssueDetails(
      m,
      latestA,
      { title: "A renamed" },
      latestA.updatedAt,
      actor(c),
      true,
    );
    const issueC = await m.issues.createIssue(m, mag, { title: "C" }, actor(c));
    const filledC = await setItems(c, issueC, [editorialItem("C")]);
    await m.issues.publishIssue(m, filledC, filledC.updatedAt, actor(c));
    expect(await pointsEventCount(fx.userId)).toBe(1);
  });

  it("an article save that read before the credit cannot make it credit twice", async () => {
    const c = await community("credit-save-race");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Race" },
      actor(c),
    );
    const a = await article("credit-save-race", mag.id);
    const filled = await setItems(c, issue, [articleItem(a)]);
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    creditFault.failNext = 1;
    const published = await m.issues.publishIssue(
      m,
      filled,
      filled.updatedAt,
      actor(c),
    );
    logged.mockRestore();
    expect(await isCredited(a)).toBe(false);

    // The author's draft autosave runs at the same time as the credit.
    await Promise.all([
      m.publication.creditPendingMagazineArticles(m, mag.id),
      m.payload.update({
        collection: "articles",
        id: a,
        draft: true,
        data: { title: "autosaved while crediting" },
      }),
    ]);
    // Then a non-draft save, then the published issue is saved again.
    await m.payload.update({
      collection: "articles",
      id: a,
      data: { title: "fixed and saved live" },
    });
    await setItems(c, published, [articleItem(a, published.items![0]!.id!)]);

    expect(await isCredited(a)).toBe(true);
    expect(await pointsEventCount(fx.userId)).toBe(1);
  });

  it("a duplicate of a credited article is not credited and does not re-credit the original", async () => {
    const c = await community("credit-dup");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Dup" },
      actor(c),
    );
    const a = await article("credit-dup", mag.id);
    const filled = await setItems(c, issue, [articleItem(a)]);
    const published = await m.issues.publishIssue(
      m,
      filled,
      filled.updatedAt,
      actor(c),
    );
    expect(await pointsEventCount(fx.userId)).toBe(1);

    const copy = await m.payload.duplicate({
      collection: "articles",
      id: a,
      depth: 0,
    });
    fx.articleIds.push(copy.id);
    expect(copy.status).toBe("draft");
    expect(copy.magazineIssue ?? null).toBeNull();
    expect(await livePlacementOf(copy.id)).toBeNull();

    await setItems(c, published, [articleItem(a, published.items![0]!.id!)]);
    expect(await isCredited(a)).toBe(true);
    expect(await isCredited(copy.id)).toBe(false);
    expect(await pointsEventCount(fx.userId)).toBe(1);
  });

  // ── Placement under concurrent article saves ─────────────────────────

  it("an article save that read before a placement claim committed keeps the new placement", async () => {
    const c = await community("place-race");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Race" },
      actor(c),
    );
    // A published, unplaced article (its author saves it live).
    const a = await article("place-race", mag.id, { status: "published" });
    const { sql } = await import("drizzle-orm");

    // An in-flight claim holds the row while the author's save starts.
    let save: Promise<unknown> | undefined;
    await m.db.transaction(async (t) => {
      await t.execute(sql`
        UPDATE "public"."articles" SET "magazine_issue_id" = ${issue.id}
        WHERE "id" = ${a} AND "magazine_issue_id" IS NULL
      `);
      save = m.payload.update({
        collection: "articles",
        id: a,
        data: { title: "author edit during the claim" },
      });
      // Let the save read the article (it sees no placement yet) and reach
      // its write before the claim commits.
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    await save;

    expect(await livePlacementOf(a)).toBe(issue.id);
    expect(await placementOf(a, false)).toBe(issue.id);
    expect(await placementOf(a, true)).toBe(issue.id);
  });

  it("article saves at the same time as setIssueItems never lose or invent a placement", async () => {
    const c = await community("place-concurrent");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Busy" },
      actor(c),
    );
    const a = await article("place-concurrent", mag.id, {
      status: "published",
    });

    const [placed] = await Promise.all([
      setItems(c, issue, [articleItem(a)]),
      m.payload.update({
        collection: "articles",
        id: a,
        data: { title: "author edit one" },
      }),
      m.payload.update({
        collection: "articles",
        id: a,
        draft: true,
        data: { title: "author autosave" },
      }),
    ]);
    expect(await livePlacementOf(a)).toBe(issue.id);
    expect(await placementOf(a, true)).toBe(issue.id);

    await Promise.all([
      setItems(c, placed, []),
      m.payload.update({
        collection: "articles",
        id: a,
        data: { title: "author edit two" },
      }),
    ]);
    expect(await livePlacementOf(a)).toBeNull();
    expect(await placementOf(a, true)).toBeNull();
  });

  it("a Payload save never places an article, on create or update", async () => {
    const c = await community("place-owned");
    const mag = await magazineIn(c);
    const issue = await m.issues.createIssue(
      m,
      mag,
      { title: "Own" },
      actor(c),
    );
    const created = await article("place-owned", mag.id, {
      magazineIssue: issue.id,
    });
    expect(await livePlacementOf(created)).toBeNull();
    await m.payload.update({
      collection: "articles",
      id: created,
      data: { magazineIssue: issue.id },
    });
    expect(await livePlacementOf(created)).toBeNull();
    expect(await placementOf(created, true)).toBeNull();
  });
});
