import type * as Jobs from "@/server/magazines/issue-jobs";
import type * as Picks from "@/server/magazines/auto-draft/picks";
import type * as Runs from "@/server/magazines/auto-draft/runs";
import type * as Settings from "@/server/magazines/auto-draft/settings";
import type * as Editing from "@/server/magazines/issue-editing";
import type * as History from "@/server/magazines/issue-history";
import type * as Issues from "@/server/magazines/issue-service";
import type * as Drafter from "@/server/magazines/auto-draft/drafter";
import { eq, inArray, sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach } from "vitest";

import {
  autoDraftSettingsInput,
  DEFAULT_AUTO_DRAFT_SETTINGS,
  type AutoDraftSettingsInput,
} from "@/lib/magazines/auto-draft";
import type { Event, Magazine } from "@/payload-types";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import type * as Schema from "@/server/db/schema";
import type { Deps } from "@/server/magazines/deps";

export function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (/neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    url,
  );
}

export const now = new Date("2026-11-01T06:00:00Z");
export const at = (minutes: number) =>
  new Date(now.getTime() + minutes * 60_000);
export const scheduleStartsAt = new Date("2026-10-01T12:00:00Z");

type Modules = Deps & {
  schema: typeof Schema;
  drafter: typeof Drafter;
  issues: typeof Issues;
  history: typeof History;
  editing: typeof Editing;
  settings: typeof Settings;
  runs: typeof Runs;
  picks: typeof Picks;
  jobs: typeof Jobs;
};
type Community = {
  id: string;
  slug: string;
  name: string;
  isListedInDirectory: boolean;
};

/** Shared DB fixture for the real drafter and isolated failure-injection suite. */
export function drafterFixture() {
  let m: Modules;
  let fx: {
    suffix: string;
    ownerId: string;
    adminId: string;
    editorId: string;
    memberId: string;
    userIds: string[];
    community: Community;
    magazine: Magazine;
    magazineIds: number[];
    communityIds: string[];
    eventIds: number[];
    threadIds: number[];
    projectIds: number[];
    newsIds: string[];
  };

  beforeAll(async () => {
    // Resolve injected service wrappers before importing their consumers.
    const issues = await import("@/server/magazines/issue-service");
    const picks = await import("@/server/magazines/auto-draft/picks");
    const [
      { db },
      schema,
      { getPayloadClient },
      drafter,
      history,
      editing,
      settings,
      runs,
      jobs,
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/payload"),
      import("@/server/magazines/auto-draft/drafter"),
      import("@/server/magazines/issue-history"),
      import("@/server/magazines/issue-editing"),
      import("@/server/magazines/auto-draft/settings"),
      import("@/server/magazines/auto-draft/runs"),
      import("@/server/magazines/issue-jobs"),
    ]);
    const { rows } = await db.execute<{ name: string }>(
      sql`select current_database() as name`,
    );
    if (rows[0]?.name !== "aitcom_test")
      throw new Error("Drafter tests require aitcom_test");
    m = {
      db,
      schema,
      payload: await getPayloadClient(),
      drafter,
      issues,
      history,
      editing,
      settings,
      runs,
      picks,
      jobs,
    };
  }, 120_000);

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const [ownerId, adminId, editorId, memberId] = [
      "owner",
      "admin",
      "editor",
      "member",
    ].map((role) => `draft-${role}-${suffix}`) as [
      string,
      string,
      string,
      string,
    ];
    const userIds = [ownerId, adminId, editorId, memberId];
    await m.db
      .insert(m.schema.user)
      .values(
        userIds.map((id) => ({ id, name: id, email: `${id}@example.test` })),
      );
    await m.db
      .insert(m.schema.memberProfiles)
      .values(userIds.map((userId) => ({ userId, displayName: userId })));
    fx = {
      suffix,
      ownerId,
      adminId,
      editorId,
      memberId,
      userIds,
      community: undefined!,
      magazine: undefined!,
      magazineIds: [],
      communityIds: [],
      eventIds: [],
      threadIds: [],
      projectIds: [],
      newsIds: [],
    };
    const made = await makeMagazine(suffix);
    fx.community = made.community;
    fx.magazine = made.magazine;
    await m.db.insert(m.schema.communityMemberships).values(
      userIds.map((userId) => ({
        userId,
        communityId: fx.community.id,
        role:
          userId === ownerId
            ? ("owner" as const)
            : userId === adminId
              ? ("admin" as const)
              : ("member" as const),
        joinedAt: userId === memberId ? at(-60) : at(-60 * 24 * 60),
      })),
    );
    await m.db.insert(m.schema.magazineStaff).values({
      magazineId: fx.magazine.id,
      communityId: fx.community.id,
      userId: editorId,
      role: "editor",
      assignedBy: ownerId,
    });
    await save();
    await article("one");
    await article("two");
    await thread(4);
    await thread(2);
    await event("2026-11-02");
  }, 60_000);

  afterEach(async () => {
    if (!fx) return;
    const { db, payload, schema: s } = m;
    await payload.delete({
      collection: "magazine-issues",
      where: { magazine: { in: fx.magazineIds } },
    });
    await payload.delete({
      collection: "articles",
      where: { authorId: { in: fx.userIds } },
    });
    await payload.delete({
      collection: "magazines",
      where: { id: { in: fx.magazineIds } },
    });
    if (fx.eventIds.length)
      await payload.delete({
        collection: "events",
        where: { id: { in: fx.eventIds } },
      });
    if (fx.threadIds.length)
      await payload.delete({
        collection: "forum-threads",
        where: { id: { in: fx.threadIds } },
      });
    if (fx.projectIds.length)
      await payload.delete({
        collection: "launchpad-projects",
        where: { id: { in: fx.projectIds } },
      });
    if (fx.newsIds.length)
      await db.delete(s.newsItems).where(inArray(s.newsItems.id, fx.newsIds));
    await db
      .delete(s.magazineStaff)
      .where(inArray(s.magazineStaff.userId, fx.userIds));
    await db
      .delete(s.spaces)
      .where(inArray(s.spaces.communityId, fx.communityIds));
    await db
      .delete(s.communityMemberships)
      .where(inArray(s.communityMemberships.userId, fx.userIds));
    await db
      .delete(s.communities)
      .where(inArray(s.communities.id, fx.communityIds));
    await db
      .delete(s.pointsEvents)
      .where(inArray(s.pointsEvents.userId, fx.userIds));
    await db
      .delete(s.activityEvents)
      .where(inArray(s.activityEvents.actorId, fx.userIds));
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

  async function makeMagazine(suffix: string) {
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({
        name: `Drafts ${suffix}`,
        slug: `draft-${suffix}`,
        createdBy: fx.ownerId,
        isListedInDirectory: true,
      })
      .returning();
    fx.communityIds.push(community!.id);
    const { saveMagazineSettings } =
      await import("@/server/magazines/magazine-service");
    const magazine = await saveMagazineSettings(
      m,
      community!,
      {
        name: "The Gazette",
        slug: `draft-${suffix}`,
        topics: [`agents${suffix}`],
        defaultVisibility: "members",
      },
      fx.ownerId,
      true,
    );
    fx.magazineIds.push(magazine.id);
    return { community: community!, magazine };
  }
  const actor = () => ({ userId: fx.editorId, community: fx.community });
  const save = (patch: Partial<AutoDraftSettingsInput> = {}) =>
    m.settings.saveAutoDraftSettings(
      m,
      fx.magazine,
      autoDraftSettingsInput.parse({
        ...DEFAULT_AUTO_DRAFT_SETTINGS,
        enabled: true,
        layout: "cover-story",
        visibility: "public",
        sources: {
          ...DEFAULT_AUTO_DRAFT_SETTINGS.sources,
          storyline: { enabled: false, max: 3 },
          newsItem: { enabled: false, max: 5 },
        },
        ...patch,
      }),
      { ...actor(), leadsCommunity: false },
      scheduleStartsAt,
    );
  async function article(label: string, date = at(-60)) {
    const doc = await m.payload.create({
      collection: "articles",
      draft: true,
      data: {
        title: `Article ${label} ${fx.suffix}`,
        slug: `draft-${label}-${fx.suffix}`,
        content: plainTextToLexical(label),
        type: "article",
        authorId: fx.memberId,
        authorName: "Sanne",
        magazine: fx.magazine.id,
        reviewStatus: "approved",
        status: "draft",
      },
    });
    await m.db.execute(
      sql`update "public"."articles" set "updated_at" = ${date} where "id" = ${doc.id}`,
    );
    await m.db.execute(
      sql`update "public"."_articles_v" set "version_updated_at" = ${date} where "parent_id" = ${doc.id}`,
    );
    return Number(doc.id);
  }
  async function thread(replies = 2, date = at(-60)) {
    const doc = await m.payload.create({
      collection: "forum-threads",
      data: {
        title: `Thread ${fx.threadIds.length} ${fx.suffix}`,
        slug: `draft-thread-${fx.threadIds.length}-${fx.suffix}`,
        content: plainTextToLexical("Talk together"),
        category: "general",
        authorId: fx.memberId,
        authorName: "Sanne",
        communityId: fx.community.id,
        replyCount: replies,
        lastActivityAt: date.toISOString(),
      },
    });
    fx.threadIds.push(Number(doc.id));
    return Number(doc.id);
  }
  async function event(date: string, status: Event["status"] = "published") {
    const doc = await m.payload.create({
      collection: "events",
      data: {
        title: `Event ${fx.eventIds.length} ${fx.suffix}`,
        slug: `draft-event-${fx.eventIds.length}-${fx.suffix}`,
        description: plainTextToLexical("Meet together"),
        type: "meetup",
        status,
        date: `${date}T00:00:00Z`,
        communityId: fx.community.id,
        location: "Test Lab",
      },
      context: { skipGeocode: true },
    });
    fx.eventIds.push(Number(doc.id));
    return Number(doc.id);
  }
  async function clearContent() {
    await m.payload.delete({
      collection: "articles",
      where: { authorId: { in: fx.userIds } },
    });
    await m.payload.delete({
      collection: "events",
      where: { id: { in: fx.eventIds } },
    });
    await m.payload.delete({
      collection: "forum-threads",
      where: { id: { in: fx.threadIds } },
    });
    fx.eventIds = [];
    fx.threadIds = [];
    await m.db
      .update(m.schema.communityMemberships)
      .set({ joinedAt: at(-60 * 24 * 60) })
      .where(eq(m.schema.communityMemberships.communityId, fx.community.id));
  }
  const issues = () =>
    m.payload.find({
      collection: "magazine-issues",
      where: { magazine: { equals: fx.magazine.id } },
      depth: 0,
      pagination: false,
    });
  const notices = () =>
    m.db
      .select()
      .from(m.schema.notifications)
      .where(inArray(m.schema.notifications.userId, fx.userIds));
  const history = () => m.history.listIssueHistory(m.db, fx.magazine.id);
  const runs = () =>
    m.db
      .select()
      .from(m.schema.magazineAutoDraftRuns)
      .where(eq(m.schema.magazineAutoDraftRuns.magazineId, fx.magazine.id));
  const manual = (date = now) =>
    m.drafter.makeAutoDraft(m, {
      magazine: fx.magazine,
      community: fx.community,
      periodKey: `manual:${crypto.randomUUID()}`,
      trigger: "manual",
      actingUserId: fx.editorId,
      requestedBy: fx.editorId,
      now: date,
    });
  const pass = (date = now) => m.drafter.runDueAutoDrafts(m, date);
  return {
    get m() {
      return m;
    },
    get fx() {
      return fx;
    },
    actor,
    save,
    article,
    thread,
    event,
    clearContent,
    issues,
    notices,
    history,
    runs,
    manual,
    pass,
    makeMagazine,
  };
}
