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

import { isMembersOnlyView } from "@/lib/magazines/item-views";
import type { magazinesRouter } from "@/server/api/routers/magazines";
import * as visibility from "@/server/communities/content-visibility-queries";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { PayloadClient } from "./deps";
import type * as Issues from "./issue-service";
import type * as Magazines from "./magazine-service";
import type * as Reading from "./reading";

// Keep the real access rule; only count its calls across concurrently loaded kinds.
vi.mock(
  "@/server/communities/content-visibility-queries",
  async (importOriginal) => {
    const real = await importOriginal<typeof visibility>();
    return {
      ...real,
      hiddenContentCommunityIds: vi.fn(real.hiddenContentCommunityIds),
    };
  },
);

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}

function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (url && looksLikeCloudNeon(url)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    url,
  );
}

function richText(text: string) {
  return {
    root: {
      type: "root",
      direction: "ltr" as const,
      format: "" as const,
      indent: 0,
      version: 1,
      children: [
        {
          type: "paragraph",
          version: 1,
          children: [{ type: "text", text, version: 1 }],
        },
      ],
    },
  };
}

describe.skipIf(!isLocalDbConfigured())(
  "platform items on reading pages [DB integration]",
  () => {
    let m: {
      db: typeof Db;
      schema: typeof Schema;
      payload: PayloadClient;
      issues: typeof Issues;
      magazines: typeof Magazines;
      reading: typeof Reading;
      router: typeof magazinesRouter;
    };
    let fx: {
      sfx: string;
      editorId: string;
      memberId: string;
      outsiderId: string;
      communityIds: string[];
      storyIds: string[];
      newsIds: string[];
      eventIds: number[];
      threadIds: number[];
      projectIds: number[];
      articleIds: number[];
    };
    let fixture: Awaited<ReturnType<typeof issueFixture>>;

    beforeAll(async () => {
      const [
        { db },
        schema,
        issues,
        magazines,
        reading,
        { magazinesRouter },
        { getPayloadClient },
        { sql },
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("./issue-service"),
        import("./magazine-service"),
        import("./reading"),
        import("@/server/api/routers/magazines"),
        import("@/server/payload"),
        import("drizzle-orm"),
      ]);
      const { rows } = await db.execute<{ name: string }>(
        sql`select current_database() as name`,
      );
      if (rows[0]?.name !== "aitcom_test")
        throw new Error(
          `Refusing to test "${rows[0]?.name}"; use aitcom_test.`,
        );
      m = {
        db,
        schema,
        issues,
        magazines,
        reading,
        router: magazinesRouter,
        payload: await getPayloadClient(),
      };
    }, 120_000);

    beforeEach(async () => {
      const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      fx = {
        sfx,
        editorId: `pir-editor-${sfx}`,
        memberId: `pir-member-${sfx}`,
        outsiderId: `pir-outsider-${sfx}`,
        communityIds: [],
        storyIds: [],
        newsIds: [],
        eventIds: [],
        threadIds: [],
        projectIds: [],
        articleIds: [],
      };
      const userIds = [fx.editorId, fx.memberId, fx.outsiderId];
      await m.db
        .insert(m.schema.user)
        .values(
          userIds.map((id) => ({ id, email: `${id}@example.test`, name: id })),
        );
      await m.db
        .insert(m.schema.memberProfiles)
        .values(userIds.map((userId) => ({ userId, displayName: userId })));
      fixture = await issueFixture();
    }, 60_000);

    afterEach(async () => {
      vi.restoreAllMocks();
      const { inArray } = await import("drizzle-orm");
      const { db, schema, payload } = m;
      if (fx.communityIds.length) {
        const { docs } = await payload.find({
          collection: "magazines",
          where: { communityId: { in: fx.communityIds } },
          depth: 0,
          pagination: false,
        });
        const ids = docs.map((doc) => doc.id);
        if (ids.length)
          await payload.delete({
            collection: "magazine-issues",
            where: { magazine: { in: ids } },
          });
        if (fx.articleIds.length)
          await payload.delete({
            collection: "articles",
            where: { id: { in: fx.articleIds } },
          });
        if (ids.length)
          await payload.delete({
            collection: "magazines",
            where: { id: { in: ids } },
          });
      }
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
      if (fx.storyIds.length)
        await db
          .delete(schema.newsStorylines)
          .where(inArray(schema.newsStorylines.id, fx.storyIds));
      if (fx.newsIds.length)
        await db
          .delete(schema.newsItems)
          .where(inArray(schema.newsItems.id, fx.newsIds));
      if (fx.communityIds.length) {
        await db
          .delete(schema.spaces)
          .where(inArray(schema.spaces.communityId, fx.communityIds));
        await db
          .delete(schema.communityMemberships)
          .where(
            inArray(schema.communityMemberships.communityId, fx.communityIds),
          );
        await db
          .delete(schema.communities)
          .where(inArray(schema.communities.id, fx.communityIds));
      }
      const userIds = [fx.editorId, fx.memberId, fx.outsiderId];
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
      await db
        .delete(schema.communityMemberships)
        .where(inArray(schema.communityMemberships.userId, userIds));
      await db.delete(schema.user).where(inArray(schema.user.id, userIds));
    }, 60_000);

    async function community(label: string, opts: { listed?: boolean } = {}) {
      const [c] = await m.db
        .insert(m.schema.communities)
        .values({
          name: `Reading ${label} ${fx.sfx}`,
          slug: `pir-${label}-${fx.sfx}`,
          createdBy: fx.editorId,
          isListedInDirectory: opts.listed ?? true,
        })
        .returning();
      fx.communityIds.push(c!.id);
      await m.db.insert(m.schema.communityMemberships).values([
        { communityId: c!.id, userId: fx.editorId, role: "owner" },
        { communityId: c!.id, userId: fx.memberId, role: "member" },
      ]);
      return c!;
    }

    async function issueFixture() {
      const c = await community("private", { listed: false });
      const magazine = await m.magazines.saveMagazineSettings(
        m,
        c,
        {
          name: `Reading ${fx.sfx}`,
          slug: `pir-${fx.sfx}`,
          topics: [],
          defaultVisibility: "members",
        },
        fx.editorId,
        true,
      );
      const actor = { userId: fx.editorId, community: c };
      const news = await m.db
        .insert(m.schema.newsItems)
        .values(
          [0, 1].map((n) => ({
            title: `Local models keep documents on the device ${n}`,
            url: `https://example.test/reading-${fx.sfx}-${n}`,
            publishedAt: new Date("2026-10-24T10:00:00.000Z"),
          })),
        )
        .returning();
      fx.newsIds = news.map((row) => row.id);
      const [story] = await m.db
        .insert(m.schema.newsStorylines)
        .values({
          slug: `pir-story-${fx.sfx}`,
          titleEn: `Public story ${fx.sfx}`,
          overviewEn: "Local models run on your own device.",
          status: "published",
          createdBy: fx.editorId,
          updatedBy: fx.editorId,
        })
        .returning();
      fx.storyIds.push(story!.id);
      await m.db.insert(m.schema.newsStorylineArticles).values(
        news.map((row) => ({
          storylineId: story!.id,
          articleId: row.id,
          noteEn: "Local models run on your own device.",
          evidence: "Local models keep documents on the device",
        })),
      );
      const event = await m.payload.create({
        collection: "events",
        data: {
          title: `Private event ${fx.sfx}`,
          slug: `pir-event-${fx.sfx}`,
          description: richText("Meet the community"),
          type: "meetup",
          status: "published",
          _status: "published",
          date: "2026-10-24",
          location: "Test Lab",
          communityId: c.id,
        },
        context: { skipGeocode: true },
      });
      fx.eventIds.push(Number(event.id));
      const thread = await m.payload.create({
        collection: "forum-threads",
        data: {
          title: `Private thread ${fx.sfx}`,
          slug: `pir-thread-${fx.sfx}`,
          content: richText("Talk with the community"),
          category: "general",
          authorId: fx.editorId,
          authorName: "Sanne",
          replyCount: 42,
          communityId: c.id,
        },
      });
      fx.threadIds.push(Number(thread.id));
      const project = await m.payload.create({
        collection: "launchpad-projects",
        data: {
          title: `Private project ${fx.sfx}`,
          slug: `pir-project-${fx.sfx}`,
          pitch: richText("Build together"),
          stage: "prototype",
          authorId: fx.editorId,
          authorName: "Sanne",
          status: "published",
          voteCount: 1,
          communityId: c.id,
        },
      });
      fx.projectIds.push(Number(project.id));
      let issue = await m.issues.createIssue(
        m,
        magazine,
        { title: "Community picks" },
        actor,
      );
      issue = (
        await m.issues.setIssueItems(
          m,
          issue,
          [
            { kind: "storyline", storylineId: story!.id },
            { kind: "newsItem", newsItemId: news[0]!.id },
            { kind: "event", eventId: Number(event.id) },
            { kind: "forumThread", threadId: Number(thread.id) },
            { kind: "launchpadProject", projectId: Number(project.id) },
          ],
          issue.updatedAt,
          actor,
        )
      ).issue;
      issue = await m.issues.updateIssueDetails(
        m,
        issue,
        { visibility: "public", confirmUnlistedPublic: true },
        issue.updatedAt,
        actor,
        true,
      );
      issue = await m.issues.publishIssue(m, issue, issue.updatedAt, actor);
      return { c, magazine, actor, issue, event, thread, project };
    }

    function readAs(viewerId: string | null) {
      return m.reading.loadIssuePage(m, {
        magazineSlug: fixture.magazine.slug,
        issueSlug: fixture.issue.slug,
        viewerId,
        locale: "en",
      });
    }

    function editorCaller() {
      return m.router.createCaller({
        db: m.db,
        headers: new Headers(),
        session: { user: { id: fx.editorId, name: "Editor" } } as never,
      });
    }

    it("a public issue never widens access to community content", async () => {
      for (const viewerId of [null, fx.outsiderId]) {
        const page = await readAs(viewerId);
        expect(page).not.toBeNull();
        expect(page!.items.map((view) => view.kind)).toEqual([
          "storyline",
          "newsItem",
        ]);
        for (const { title } of [
          fixture.event,
          fixture.thread,
          fixture.project,
        ])
          expect(JSON.stringify(page)).not.toContain(title);
      }
      const member = await readAs(fx.memberId);
      expect(member!.items.map((view) => view.kind)).toEqual([
        "storyline",
        "newsItem",
        "event",
        "forumThread",
        "launchpadProject",
      ]);
      expect(member!.items.every((view) => !isMembersOnlyView(view))).toBe(
        true,
      );
      expect(member!.items.slice(2)).toMatchObject([
        { membersOnly: false },
        { membersOnly: false },
        { membersOnly: false },
      ]);
      const editor = await readAs(fx.editorId);
      expect(editor!.items.map((view) => view.kind)).toEqual([
        "storyline",
        "newsItem",
        "event",
        "forumThread",
        "launchpadProject",
      ]);
      expect(editor!.items.slice(2)).toMatchObject([
        { membersOnly: true },
        { membersOnly: true },
        { membersOnly: true },
      ]);
    });

    it("content that goes away becomes a marker and never blocks the editor", async () => {
      const { eq } = await import("drizzle-orm");
      await m.db
        .update(m.schema.newsStorylines)
        .set({ status: "draft" })
        .where(eq(m.schema.newsStorylines.id, fx.storyIds[0]!));
      await m.payload.update({
        collection: "forum-threads",
        id: fixture.thread.id,
        data: { isDeleted: true },
      });
      await m.payload.update({
        collection: "launchpad-projects",
        id: fixture.project.id,
        data: { status: "archived" },
      });
      const reader = await readAs(fx.memberId);
      expect(reader!.items.map((view) => view.kind)).toEqual([
        "newsItem",
        "event",
      ]);
      expect(reader!.items[0]).toMatchObject({
        kind: "newsItem",
        news: { title: "Local models keep documents on the device 0" },
      });
      const caller = editorCaller();
      const editing = await caller.getIssueForEditing({
        slug: fixture.c.slug,
        issueId: fixture.issue.id,
      });
      expect(editing.problems).toEqual([]);
      expect(
        editing.items.filter((view) => "unavailable" in view),
      ).toMatchObject([
        { kind: "storyline", reason: "unpublished" },
        { kind: "forumThread", reason: "missing" },
        { kind: "launchpadProject", reason: "unpublished" },
      ]);
      await caller.setIssueItems({
        slug: fixture.c.slug,
        issueId: fixture.issue.id,
        expectedUpdatedAt: editing.issue.updatedAt,
        items: editing.storedItems.map((item) =>
          item.kind === "newsItem"
            ? { ...item, intro: "Start with this update." }
            : item,
        ),
      });
      expect((await readAs(fx.memberId))!.items[0]).toMatchObject({
        kind: "newsItem",
        intro: "Start with this update.",
      });
    });

    it("loads each kind once per page", async () => {
      const find = vi.spyOn(m.payload, "find");
      const hidden = vi.mocked(visibility.hiddenContentCommunityIds);
      hidden.mockClear();
      expect((await readAs(fx.memberId))!.items).toHaveLength(5);
      for (const collection of [
        "events",
        "forum-threads",
        "launchpad-projects",
      ]) {
        expect(
          find.mock.calls.filter(([args]) => args.collection === collection),
          collection,
        ).toHaveLength(1);
      }
      expect(hidden).toHaveBeenCalledExactlyOnceWith(m.db, fx.memberId);
    });

    it("the article page loads only articles", async () => {
      const article = await m.payload.create({
        collection: "articles",
        data: {
          title: "A magazine article",
          slug: `pir-article-${fx.sfx}`,
          content: richText("An original story"),
          type: "article",
          authorId: fx.editorId,
          authorName: "Editor",
          authorType: "member",
          reviewStatus: "approved",
          status: "draft",
          magazine: fixture.magazine.id,
        },
      });
      fx.articleIds.push(article.id);
      const { toItemInputs } = await import("./items/registry");
      await m.issues.setIssueItems(
        m,
        fixture.issue,
        [
          ...toItemInputs(fixture.issue.items ?? []),
          { kind: "article", articleId: article.id },
        ],
        fixture.issue.updatedAt,
        fixture.actor,
      );
      const find = vi.spyOn(m.payload, "find");
      const hidden = vi.mocked(visibility.hiddenContentCommunityIds);
      hidden.mockClear();
      const page = await m.reading.loadMagazineArticlePage(m, {
        magazineSlug: fixture.magazine.slug,
        issueSlug: fixture.issue.slug,
        articleSlug: article.slug,
        viewerId: fx.memberId,
        locale: "en",
      });
      expect(page?.article.id).toBe(article.id);
      expect(
        find.mock.calls.some(([args]) =>
          ["events", "forum-threads", "launchpad-projects"].includes(
            args.collection,
          ),
        ),
      ).toBe(false);
      expect(hidden).not.toHaveBeenCalled();
    });
  },
);
