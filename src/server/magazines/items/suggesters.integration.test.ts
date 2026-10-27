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

import {
  AUTO_DRAFT_SOURCE_IDS,
  type AutoDraftSourceId,
} from "@/lib/magazines/auto-draft";
import { magazineArticleEditPath } from "@/lib/magazines/paths";
import type { Event, Magazine } from "@/payload-types";
import {
  lexicalToPlainText,
  plainTextToLexical,
} from "@/server/challenge-engine/lexical";
import type * as Schema from "@/server/db/schema";

import type { Deps } from "../deps";
import type * as Context from "./context";
import type * as Events from "./event/suggest";
import type * as Suggesters from "./suggesters";
import type { SuggestContext } from "./types";

// Vitest resolves next-intl's client entry. Keep the real message formatter,
// without the React Server Component/request wrapper, in these Node tests.
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/i18n/messages");
  return {
    getTranslations: async ({
      locale,
      namespace,
    }: {
      locale: "en" | "nl";
      namespace: "magazineEditor.autoDraft.welcome";
    }) =>
      createTranslator({
        locale,
        namespace,
        messages: await loadMessages(locale),
      }),
  };
});

function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (/neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    url,
  );
}

const baseTime = new Date("2026-10-27T12:00:00Z");
const at = (minutes: number) => new Date(baseTime.getTime() + minutes * 60_000);
const day = (offset: number) =>
  new Date(Date.UTC(2026, 9, 27 + offset)).toISOString();
const window = { since: at(-60 * 24 * 30), until: at(0) };

describe.skipIf(!isLocalDbConfigured())(
  "magazine suggestions [DB integration]",
  { timeout: 30_000 },
  () => {
    let m: Deps & {
      schema: typeof Schema;
      context: typeof Context;
      suggesters: typeof Suggesters;
      events: typeof Events;
    };
    let fx: {
      suffix: string;
      userIds: string[];
      community: {
        id: string;
        slug: string;
        name: string;
        isListedInDirectory: boolean;
      };
      communityIds: string[];
      magazine: Magazine;
      eventIds: number[];
      threadIds: number[];
      projectIds: number[];
      newsIds: string[];
      storyIds: string[];
      ctx: SuggestContext;
    };

    beforeAll(async () => {
      const [
        { db },
        schema,
        context,
        suggesters,
        events,
        { getPayloadClient },
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("./context"),
        import("./suggesters"),
        import("./event/suggest"),
        import("@/server/payload"),
      ]);
      const { rows } = await db.execute<{ name: string }>(
        sql`select current_database() as name`,
      );
      if (rows[0]?.name !== "aitcom_test")
        throw new Error("Suggestions tests require aitcom_test");
      m = {
        db,
        schema,
        context,
        suggesters,
        events,
        payload: await getPayloadClient(),
      };
    }, 120_000);

    beforeEach(async () => {
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const userIds = ["owner", "member", "other", "pending", "invited"].map(
        (role) => `sg-${role}-${suffix}`,
      );
      await m.db
        .insert(m.schema.user)
        .values(
          userIds.map((id) => ({ id, name: id, email: `${id}@example.test` })),
        );
      await m.db
        .insert(m.schema.memberProfiles)
        .values(userIds.map((userId) => ({ userId, displayName: userId })));
      const [community] = await m.db
        .insert(m.schema.communities)
        .values({
          name: `Suggestions ${suffix}`,
          slug: `sg-${suffix}`,
          createdBy: userIds[0]!,
          isListedInDirectory: true,
        })
        .returning();
      await m.db.insert(m.schema.communityMemberships).values([
        {
          communityId: community!.id,
          userId: userIds[0]!,
          role: "owner",
          joinedAt: at(-60 * 24 * 40),
        },
        {
          communityId: community!.id,
          userId: userIds[1]!,
          joinedAt: at(-60 * 24 * 40),
        },
      ]);
      const { saveMagazineSettings } = await import("../magazine-service");
      const magazine = await saveMagazineSettings(
        m,
        community!,
        {
          name: "The Gazette",
          slug: `sg-${suffix}`,
          topics: [`agents${suffix}`, `robotics${suffix}`],
          defaultVisibility: "members",
        },
        userIds[0]!,
        true,
      );
      fx = {
        suffix,
        userIds,
        community: community!,
        communityIds: [community!.id],
        magazine,
        eventIds: [],
        threadIds: [],
        projectIds: [],
        newsIds: [],
        storyIds: [],
        ctx: m.context.suggestContextFor(m, {
          magazine,
          community: community!,
          viewerId: userIds[0]!,
          locale: "en",
          now: at(0),
        }),
      };
    }, 60_000);

    afterEach(async () => {
      if (!fx) return;
      const { db, payload, schema: s } = m;
      await db
        .delete(s.eventRegistrations)
        .where(inArray(s.eventRegistrations.userId, fx.userIds));
      await payload.delete({
        collection: "magazine-issues",
        where: { magazine: { equals: fx.magazine.id } },
      });
      await payload.delete({
        collection: "articles",
        where: { authorId: { in: fx.userIds } },
      });
      await payload.delete({ collection: "magazines", id: fx.magazine.id });
      for (const [collection, ids] of [
        ["events", fx.eventIds],
        ["forum-threads", fx.threadIds],
        ["launchpad-projects", fx.projectIds],
      ] as const) {
        if (ids.length)
          await payload.delete({ collection, where: { id: { in: ids } } });
      }
      if (fx.storyIds.length)
        await db
          .delete(s.newsStorylines)
          .where(inArray(s.newsStorylines.id, fx.storyIds));
      if (fx.newsIds.length)
        await db.delete(s.newsItems).where(inArray(s.newsItems.id, fx.newsIds));
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

    const suggest = <S extends AutoDraftSourceId>(
      source: S,
      limit = 20,
      exclude: string[] = [],
    ) =>
      m.suggesters.suggestCandidates(source, fx.ctx, window, {
        limit,
        exclude,
      });

    async function article(
      label: string,
      days: number,
      opts: { authorId?: string; pending?: boolean } = {},
    ) {
      const doc = await m.payload.create({
        collection: "articles",
        draft: true,
        data: {
          title: `Article ${label} ${fx.suffix}`,
          slug: `sg-${label}-${fx.suffix}`,
          content: plainTextToLexical(label),
          type: "article",
          authorId: opts.authorId ?? fx.userIds[1]!,
          authorName: "Sanne",
          magazine: fx.magazine.id,
          reviewStatus: opts.pending ? "pending_review" : "approved",
          status: "draft",
        },
      });
      // Draft reads use the latest version's timestamp, not the main row alone.
      await m.db.execute(
        sql`update "public"."articles" set "updated_at" = ${at(-60 * 24 * days)} where "id" = ${doc.id}`,
      );
      await m.db.execute(
        sql`update "public"."_articles_v" set "version_updated_at" = ${at(-60 * 24 * days)} where "parent_id" = ${doc.id}`,
      );
      return doc;
    }

    async function event(
      offset: number,
      opts: {
        status?: Event["status"];
        end?: number;
        communityId?: string;
      } = {},
    ) {
      const doc = await m.payload.create({
        collection: "events",
        data: {
          title: `Event ${fx.eventIds.length} ${fx.suffix}`,
          slug: `sg-event-${fx.eventIds.length}-${fx.suffix}`,
          description: plainTextToLexical("Meet the community"),
          type: "meetup",
          status: opts.status ?? "published",
          date: day(offset),
          ...(opts.end === undefined ? {} : { endDate: day(opts.end) }),
          communityId: opts.communityId ?? fx.community.id,
          location: "Test Lab",
        },
        context: { skipGeocode: true },
      });
      fx.eventIds.push(Number(doc.id));
      return Number(doc.id);
    }

    async function thread(
      replies: number,
      views = 0,
      days = 1,
      deleted = false,
    ) {
      const doc = await m.payload.create({
        collection: "forum-threads",
        data: {
          title: `Thread ${fx.threadIds.length} ${fx.suffix}`,
          slug: `sg-thread-${fx.threadIds.length}-${fx.suffix}`,
          content: plainTextToLexical("Talk together"),
          category: "general",
          authorId: fx.userIds[1]!,
          authorName: "Sanne",
          communityId: fx.community.id,
          replyCount: replies,
          viewCount: views,
          lastActivityAt: at(-60 * 24 * days).toISOString(),
          isDeleted: deleted,
        },
      });
      fx.threadIds.push(Number(doc.id));
      return Number(doc.id);
    }

    async function project(
      votes: number,
      opts: {
        unscoped?: boolean;
        outsider?: boolean;
        draft?: boolean;
        days?: number;
      } = {},
    ) {
      const doc = await m.payload.create({
        collection: "launchpad-projects",
        data: {
          title: `Project ${fx.projectIds.length} ${fx.suffix}`,
          slug: `sg-project-${fx.projectIds.length}-${fx.suffix}`,
          pitch: plainTextToLexical("Build together"),
          stage: "prototype",
          authorName: "Sanne",
          authorId: fx.userIds[opts.outsider ? 2 : 1]!,
          communityId: opts.unscoped ? null : fx.community.id,
          status: opts.draft ? "draft" : "published",
          voteCount: votes,
        },
      });
      fx.projectIds.push(Number(doc.id));
      await m.db.execute(
        sql`update "public"."launchpad_projects" set "updated_at" = ${at(-60 * 24 * (opts.days ?? 1))} where "id" = ${doc.id}`,
      );
      return Number(doc.id);
    }

    async function news(title: string, days = 1, summary = "") {
      const [row] = await m.db
        .insert(m.schema.newsItems)
        .values({
          title: `${title}${fx.suffix}`,
          summary,
          url: `https://example.test/sg-${fx.suffix}-${fx.newsIds.length}`,
          publishedAt: at(-60 * 24 * days),
        })
        .returning();
      fx.newsIds.push(row!.id);
      return row!;
    }

    async function story(
      title: string,
      days: number,
      opts: {
        draft?: boolean;
        invalidRecent?: boolean;
        titleNl?: string;
        overviewNl?: string;
      } = {},
    ) {
      const [row] = await m.db
        .insert(m.schema.newsStorylines)
        .values({
          slug: `sg-${fx.storyIds.length}-${fx.suffix}`,
          titleEn: `${title}${fx.suffix}`,
          titleNl: opts.titleNl ?? "",
          overviewNl: opts.overviewNl ?? "",
          overviewEn: "What changed in our field.",
          status: opts.draft ? "draft" : "published",
          createdBy: fx.userIds[0]!,
          updatedBy: fx.userIds[0]!,
        })
        .returning();
      fx.storyIds.push(row!.id);
      for (let n = 0; n < 2; n++) {
        const source = await news(
          "Local models keep documents on the device ",
          days + n,
        );
        await m.db.insert(m.schema.newsStorylineArticles).values({
          storylineId: row!.id,
          articleId: source.id,
          noteEn: "A useful step.",
          evidence: "Local models keep documents on the device",
        });
      }
      if (opts.invalidRecent) {
        const source = await news("Unsupported claim ", 1);
        await m.db.insert(m.schema.newsStorylineArticles).values({
          storylineId: row!.id,
          articleId: source.id,
          noteEn: "A step.",
          evidence: "This evidence is not in the article",
        });
      }
      return row!;
    }

    it("suggests approved articles that waited longest first", async () => {
      const oldest = await article("oldest", 3, { authorId: fx.userIds[0]! });
      const middle = await article("middle", 2);
      const newest = await article("newest", 1);
      const placed = await article("placed", 4);
      await article("pending", 5, { pending: true });
      const issues = await import("../issue-service");
      const actor = { userId: fx.userIds[0]!, community: fx.community };
      const issue = await issues.createIssue(
        m,
        fx.magazine,
        { title: "Placed" },
        actor,
      );
      await issues.setIssueItems(
        m,
        issue,
        [{ kind: "article", articleId: Number(placed.id) }],
        issue.updatedAt,
        actor,
      );
      const result = await suggest("article");
      expect(result.map((c) => c.input.articleId)).toEqual(
        [oldest.id, middle.id, newest.id].map(Number),
      );
      expect(result.map((c) => c.reason)).toEqual(
        [3, 2, 1].map((days) => ({
          type: "waitingSince",
          at: at(-60 * 24 * days).toISOString(),
        })),
      );
      expect(result[0]?.openHref).toBe(
        magazineArticleEditPath(fx.community.slug, oldest.slug),
      );
      expect(result.slice(1).map((c) => c.openHref)).toEqual([null, null]);
      expect(
        (await suggest("article", 20, [`article:${oldest.id}`])).map(
          (c) => c.input.articleId,
        ),
      ).toEqual([middle.id, newest.id].map(Number));
      expect(
        (await suggest("article", 1)).map((c) => c.input.articleId),
      ).toEqual([Number(oldest.id)]);
    });

    it("puts coming events first, then past ones by how many went", async () => {
      const today = await event(0);
      const soon = await event(2);
      await event(40);
      const small = await event(-3);
      const large = await event(-5, { status: "completed" });
      await event(-4, { status: "cancelled" });
      const [other] = await m.db
        .insert(m.schema.communities)
        .values({
          name: `Other ${fx.suffix}`,
          slug: `sg-other-${fx.suffix}`,
          createdBy: fx.userIds[0]!,
        })
        .returning();
      fx.communityIds.push(other!.id);
      await event(-2, { communityId: other!.id });
      await m.db.insert(m.schema.eventRegistrations).values([
        { eventId: small, userId: fx.userIds[0]!, status: "registered" },
        { eventId: large, userId: fx.userIds[0]!, status: "registered" },
        { eventId: large, userId: fx.userIds[1]!, status: "attended" },
        { eventId: large, userId: fx.userIds[2]!, status: "cancelled" },
      ]);
      const result = await suggest("event");
      expect(result.map((c) => c.input.eventId)).toEqual([
        today,
        soon,
        large,
        small,
      ]);
      expect(result.map((c) => c.reason)).toEqual([
        { type: "eventComingUp", at: day(0) },
        { type: "eventComingUp", at: day(2) },
        { type: "eventRecap", at: day(-5), going: 2 },
        { type: "eventRecap", at: day(-3), going: 1 },
      ]);
      expect(
        (await suggest("event", 2, [`event:${today}`])).map(
          (c) => c.input.eventId,
        ),
      ).toEqual([soon, large]);
    });

    it("an event has ended only after its last day", async () => {
      await event(0);
      const yesterday = await event(-1);
      await event(-2, { end: 0 });
      expect(
        await m.events.endedCommunityEvents(
          m,
          fx.community,
          window.since,
          at(0),
        ),
      ).toEqual([{ id: yesterday, endsAt: new Date(day(0)) }]);
    });

    it("ranks threads by replies inside the window", async () => {
      await thread(9, 0, 40);
      const fewerViews = await thread(5, 10);
      const moreViews = await thread(5, 20);
      const small = await thread(2);
      await thread(20, 0, 1, true);
      const result = await suggest("forumThread");
      expect(result.map((c) => c.input.threadId)).toEqual([
        moreViews,
        fewerViews,
        small,
      ]);
      expect(result.map((c) => c.reason)).toEqual(
        [5, 5, 2].map((count) => ({ type: "mostReplies", count })),
      );
      expect(
        (await suggest("forumThread", 1, [`forumThread:${moreViews}`]))[0]
          ?.input.threadId,
      ).toBe(fewerViews);
    });

    it("ranks projects by upvotes inside the window", async () => {
      const local = await project(7);
      const member = await project(9, { unscoped: true });
      await project(20, { unscoped: true, outsider: true });
      await project(30, { draft: true });
      const result = await suggest("launchpadProject");
      expect(result.map((c) => c.input.projectId)).toEqual([member, local]);
      expect(result.map((c) => c.reason)).toEqual(
        [9, 7].map((count) => ({ type: "mostUpvotes", count })),
      );
      expect(
        (
          await suggest("launchpadProject", 1, [`launchpadProject:${member}`])
        )[0]?.input.projectId,
      ).toBe(local);
    });

    it("old popular projects do not crowd out recent ones", async () => {
      await project(50, { unscoped: true, days: 40 });
      const recent = await project(3, { unscoped: true });
      expect(
        (await suggest("launchpadProject", 1)).map((c) => c.input.projectId),
      ).toEqual([recent]);
    });

    it("later updates do not crowd out projects inside the window", async () => {
      await project(50, { unscoped: true, days: -1 });
      const recent = await project(3, { unscoped: true });
      await project(2);
      expect(
        (await suggest("launchpadProject", 1)).map((c) => c.input.projectId),
      ).toEqual([recent]);
    });

    async function newMembers() {
      await m.db
        .update(m.schema.communityMemberships)
        .set({ joinedAt: at(-60) })
        .where(
          and(
            eq(m.schema.communityMemberships.communityId, fx.community.id),
            inArray(
              m.schema.communityMemberships.userId,
              fx.userIds.slice(0, 2),
            ),
          ),
        );
      await m.db.insert(m.schema.communityMemberships).values([
        {
          communityId: fx.community.id,
          userId: fx.userIds[2]!,
          joinedAt: at(-60 * 24 * 40),
        },
        {
          communityId: fx.community.id,
          userId: fx.userIds[3]!,
          joinedAt: at(-60),
          status: "pending_approval",
        },
        {
          communityId: fx.community.id,
          userId: fx.userIds[4]!,
          joinedAt: at(-60),
          status: "invited",
        },
      ]);
    }

    it("welcomes new members with a count, never names", async () => {
      await newMembers();
      fx.ctx.locale = "nl";
      const result = await suggest("welcome");
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        title: "Welcome to our new members",
        reference: null,
        input: { kind: "editorial", heading: "Welcome to our new members" },
        reason: { type: "newMembers", count: 2 },
      });
      const body = lexicalToPlainText(result[0]!.input.body);
      expect(body).toBe(
        `2 people joined ${fx.community.name} since 27 September 2026. Say hello!`,
      );
      for (const name of fx.userIds) expect(body).not.toContain(name);
      expect(await suggest("welcome", 0)).toEqual([]);
      expect(
        await m.suggesters.suggestCandidates(
          "welcome",
          fx.ctx,
          { since: at(1), until: at(2) },
          { limit: 1, exclude: [] },
        ),
      ).toEqual([]);
    });

    it("gives the same answer every time", async () => {
      await article("stable", 1);
      await event(1);
      await event(-2);
      await thread(5);
      await project(7, { unscoped: true });
      await story(`AI agents${fx.suffix} at work `, 1);
      await news(`AI agents${fx.suffix} at work `);
      await newMembers();
      const { searchPickerCandidates } = await import("./pickers");
      for (const source of AUTO_DRAFT_SOURCE_IDS) {
        const first = await suggest(source);
        expect(first.length).toBeGreaterThan(0);
        expect(await suggest(source)).toEqual(first);
        if (source === "welcome") continue;
        const search = await searchPickerCandidates(source, fx.suffix, fx.ctx);
        for (const candidate of first) {
          const picked = search.find(
            (item) => item.reference === candidate.reference,
          );
          expect(picked).toBeDefined();
          expect(candidate.facts).toEqual(picked!.facts);
          expect(candidate.openHref).toBe(picked!.openHref);
        }
      }
    });

    it("suggests storylines that match a topic and moved recently", async () => {
      const agents = await story(`AI agents${fx.suffix} at work `, 2);
      const robotics = await story(`Robotics${fx.suffix} weekly `, 1, {
        titleNl: `Robotica ${fx.suffix}`,
      });
      await story(`Agents${fx.suffix} of change `, 40, { invalidRecent: true });
      await story("Gardening ", 1);
      await story(`Draft agents${fx.suffix} `, 1, { draft: true });
      const result = await suggest("storyline");
      expect(result.map((c) => c.input.storylineId)).toEqual([
        robotics.id,
        agents.id,
      ]);
      expect(result.map((c) => c.reason)).toEqual([
        { type: "topic", topic: `robotics${fx.suffix}` },
        { type: "topic", topic: `agents${fx.suffix}` },
      ]);
      expect(
        (await suggest("storyline", 1, [`storyline:${robotics.id}`]))[0]?.input
          .storylineId,
      ).toBe(agents.id);
      fx.ctx.locale = "nl";
      expect((await suggest("storyline"))[0]?.title).toBe(
        `Robotica ${fx.suffix}`,
      );
    });

    it("suggests news headlines that match a topic inside the window", async () => {
      const title = await news(`AI agents${fx.suffix} at work `, 2);
      const summary = await news(
        "New release ",
        1,
        `Robotics${fx.suffix} and agents${fx.suffix}`,
      );
      await news(`Agents${fx.suffix} outside `, 40);
      await news(`Agents${fx.suffix} future `, -1);
      await news("Gardening ");
      const result = await suggest("newsItem");
      expect(result.map((c) => c.input.newsItemId)).toEqual([
        summary.id,
        title.id,
      ]);
      expect(result.map((c) => c.reason)).toEqual([
        { type: "topic", topic: `agents${fx.suffix}` },
        { type: "topic", topic: `agents${fx.suffix}` },
      ]);
      expect(
        (await suggest("newsItem", 1, [`newsItem:${summary.id}`]))[0]?.input
          .newsItemId,
      ).toBe(title.id);
    });

    it("suggests no news for a magazine without topics", async () => {
      fx.ctx.topics = [];
      expect(await suggest("newsItem")).toEqual([]);
      expect(await suggest("storyline")).toEqual([]);
    });
  },
);
