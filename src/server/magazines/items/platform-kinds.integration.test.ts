// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IssueReaderAccess } from "@/lib/magazines/access";
import type { MagazineIssue } from "@/payload-types";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { PayloadClient } from "../deps";
import type * as Issues from "../issue-service";
import type * as Magazines from "../magazine-service";
import type * as Context from "./context";
import type * as Pickers from "./pickers";
import type * as Registry from "./registry";

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

describe.skipIf(!isLocalDbConfigured())(
  "platform item kinds [DB integration]",
  () => {
    let m: {
      db: typeof Db;
      payload: PayloadClient;
      schema: typeof Schema;
      issues: typeof Issues;
      magazines: typeof Magazines;
      registry: typeof Registry;
      pickers: typeof Pickers;
      context: typeof Context;
    };
    let fx: {
      sfx: string;
      editorId: string;
      outsiderId: string;
      eventIds: number[];
      threadIds: number[];
      projectIds: number[];
      communityIds: string[];
      storyIds: string[];
      newsIds: string[];
    };

    beforeAll(async () => {
      const [
        database,
        schema,
        issues,
        magazines,
        registry,
        pickers,
        context,
        { getPayloadClient },
        { sql },
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("../issue-service"),
        import("../magazine-service"),
        import("./registry"),
        import("./pickers"),
        import("./context"),
        import("@/server/payload"),
        import("drizzle-orm"),
      ]);
      const { rows } = await database.db.execute<{ name: string }>(
        sql`select current_database() as name`,
      );
      if (rows[0]?.name !== "aitcom_test")
        throw new Error(
          `Refusing to test "${rows[0]?.name}"; use aitcom_test.`,
        );
      m = {
        db: database.db,
        schema,
        issues,
        magazines,
        registry,
        pickers,
        context,
        payload: await getPayloadClient(),
      };
    }, 120_000);

    beforeEach(async () => {
      const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      fx = {
        sfx,
        editorId: `pk-editor-${sfx}`,
        outsiderId: `pk-outsider-${sfx}`,
        eventIds: [],
        threadIds: [],
        projectIds: [],
        communityIds: [],
        storyIds: [],
        newsIds: [],
      };
      await m.db.insert(m.schema.user).values(
        [fx.editorId, fx.outsiderId].map((id) => ({
          id,
          email: `${id}@example.test`,
          name: "Reader",
        })),
      );
      await m.db
        .insert(m.schema.memberProfiles)
        .values({ userId: fx.editorId, displayName: "Editor" });
      const news = await m.db
        .insert(m.schema.newsItems)
        .values(
          [0, 1].map((n) => ({
            title: `Local models keep documents on the device ${n}`,
            url: `https://example.test/platform-${sfx}-${n}`,
            publishedAt: new Date(`2026-10-${23 + n}T10:00:00.000Z`),
          })),
        )
        .returning();
      fx.newsIds = news.map((row) => row.id);
      await story("public", "published");
    }, 60_000);

    afterEach(async () => {
      const { eq, inArray } = await import("drizzle-orm");
      const { db, payload, schema } = m;
      if (fx.projectIds.length)
        await payload.delete({
          collection: "launchpad-projects",
          where: { id: { in: fx.projectIds } },
        });
      if (fx.threadIds.length)
        await payload.delete({
          collection: "forum-threads",
          where: { id: { in: fx.threadIds } },
        });
      if (fx.eventIds.length)
        await payload.delete({
          collection: "events",
          where: { id: { in: fx.eventIds } },
        });
      if (fx.communityIds.length) {
        const { docs } = await payload.find({
          collection: "magazines",
          where: { communityId: { in: fx.communityIds } },
          depth: 0,
          pagination: false,
        });
        const ids = docs.map((doc) => doc.id);
        if (ids.length) {
          await payload.delete({
            collection: "magazine-issues",
            where: { magazine: { in: ids } },
          });
          await payload.delete({
            collection: "magazines",
            where: { id: { in: ids } },
          });
        }
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
      if (fx.storyIds.length)
        await db
          .delete(schema.newsStorylines)
          .where(inArray(schema.newsStorylines.id, fx.storyIds));
      if (fx.newsIds.length)
        await db
          .delete(schema.newsItems)
          .where(inArray(schema.newsItems.id, fx.newsIds));
      await db
        .delete(schema.pointsEvents)
        .where(eq(schema.pointsEvents.userId, fx.editorId));
      await db
        .delete(schema.activityEvents)
        .where(eq(schema.activityEvents.actorId, fx.editorId));
      await db
        .delete(schema.notifications)
        .where(eq(schema.notifications.userId, fx.editorId));
      await db
        .delete(schema.memberBadges)
        .where(eq(schema.memberBadges.userId, fx.editorId));
      await db
        .delete(schema.memberProfiles)
        .where(eq(schema.memberProfiles.userId, fx.editorId));
      await db
        .delete(schema.user)
        .where(inArray(schema.user.id, [fx.editorId, fx.outsiderId]));
    }, 60_000);

    async function story(
      label: string,
      status: "draft" | "published",
      withEvidence = true,
    ) {
      const [row] = await m.db
        .insert(m.schema.newsStorylines)
        .values({
          slug: `pk-${label}-${fx.sfx}`,
          titleEn: `Local AI ${label} ${fx.sfx}`,
          overviewEn: "Local models run on your own device.",
          status,
          createdBy: fx.editorId,
          updatedBy: fx.editorId,
        })
        .returning();
      fx.storyIds.push(row!.id);
      await m.db.insert(m.schema.newsStorylineArticles).values(
        fx.newsIds.map((articleId) => ({
          storylineId: row!.id,
          articleId,
          noteEn: "A practical step for local AI.",
          evidence: withEvidence
            ? "Local models keep documents on the device"
            : "Unsupported claim",
        })),
      );
      return row!;
    }

    async function community(label: string, opts: { listed?: boolean } = {}) {
      const [c] = await m.db
        .insert(m.schema.communities)
        .values({
          name: `Platform ${label} ${fx.sfx}`,
          slug: `pk-${label}-${fx.sfx}`,
          createdBy: fx.editorId,
          isListedInDirectory: opts.listed ?? true,
        })
        .returning();
      fx.communityIds.push(c!.id);
      await m.db
        .insert(m.schema.communityMemberships)
        .values({ communityId: c!.id, userId: fx.editorId, role: "owner" });
      return c!;
    }

    async function issueFixture(opts: { listed?: boolean } = {}) {
      const c = await community("stories", opts);
      const magazine = await m.magazines.saveMagazineSettings(
        m,
        c,
        {
          name: `Platform ${fx.sfx}`,
          slug: `pk-${fx.sfx}`,
          topics: [],
          defaultVisibility: "public",
          confirmUnlistedPublic: true,
        },
        fx.editorId,
      );
      const actor = { userId: fx.editorId, community: c };
      const issue = await m.issues.createIssue(
        m,
        magazine,
        { title: "Local AI stories" },
        actor,
      );
      return { c, magazine, actor, issue };
    }

    async function project(
      communityId: string | null,
      label: string,
      opts: {
        authorId?: string;
        status?: "draft" | "published" | "archived";
        voteCount?: number;
      } = {},
    ) {
      const doc = await m.payload.create({
        collection: "launchpad-projects",
        data: {
          title: `Project ${label} ${fx.sfx}`,
          slug: `pk-project-${label}-${fx.sfx}`,
          pitch: {
            root: {
              type: "root",
              version: 1,
              direction: "ltr",
              format: "",
              indent: 0,
              children: [
                {
                  type: "paragraph",
                  version: 1,
                  children: [
                    { type: "text", text: "Build together", version: 1 },
                  ],
                },
              ],
            },
          },
          stage: "prototype",
          authorId: opts.authorId ?? fx.editorId,
          authorName: "Sanne",
          status: opts.status ?? "published",
          voteCount: opts.voteCount ?? 1,
          communityId,
        },
      });
      fx.projectIds.push(Number(doc.id));
      return doc;
    }

    it("an archived project drops out for readers and is marked for editors", async () => {
      const { c, magazine, actor, issue } = await issueFixture();
      const doc = await project(c.id, "archive");
      const projectId = Number(doc.id);
      const saved = await m.issues.setIssueItems(
        m,
        issue,
        [{ kind: "launchpadProject", projectId, intro: "Our pick" }],
        issue.updatedAt,
        actor,
      );
      const load = (access: IssueReaderAccess) =>
        m.registry.loadIssueItemViews(
          saved.items as Registry.StoredBlock[],
          m.context.itemContextFor(m, {
            magazineId: magazine.id,
            community: c,
            issueId: saved.id,
            locale: "en",
            access,
            viewerId: access === "editor" ? fx.editorId : null,
          }),
        );
      expect(await load("full")).toMatchObject([
        {
          kind: "launchpadProject",
          intro: "Our pick",
          project: { title: doc.title, pitch: "Build together", voteCount: 1 },
        },
      ]);
      await m.payload.update({
        collection: "launchpad-projects",
        id: doc.id,
        data: { title: "A live project title", voteCount: 120 },
      });
      expect(await load("full")).toMatchObject([
        { project: { title: "A live project title", voteCount: 120 } },
      ]);
      await m.payload.update({
        collection: "launchpad-projects",
        id: doc.id,
        data: { status: "archived" },
      });
      expect(await load("full")).toEqual([]);
      expect(await load("editor")).toEqual([
        {
          kind: "launchpadProject",
          itemId: saved.items![0]!.id,
          unavailable: true,
          reason: "unpublished",
        },
      ]);
      const reloaded = await m.payload.findByID({
        collection: "magazine-issues",
        id: saved.id,
        depth: 0,
      });
      expect(
        m.registry.toItemInputs(reloaded.items as Registry.StoredBlock[]),
      ).toMatchObject([{ kind: "launchpadProject", projectId }]);
      const kept = await m.issues.setIssueItems(
        m,
        reloaded,
        [{ kind: "launchpadProject", projectId, intro: "Still our pick" }],
        reloaded.updatedAt,
        actor,
      );
      expect(kept.items![0]!.intro).toBe("Still our pick");
      await m.issues.publishIssue(m, kept, kept.updatedAt, actor);
    });

    it("the projects tab offers community projects and members' unscoped projects", async () => {
      const { c, magazine, actor, issue } = await issueFixture();
      const local = await project(c.id, "local");
      const member = await project(null, "member", { voteCount: 2 });
      const inactive = await project(null, "inactive", {
        authorId: fx.outsiderId,
        voteCount: 3,
      });
      await m.db.insert(m.schema.communityMemberships).values({
        communityId: c.id,
        userId: fx.outsiderId,
        role: "member",
        status: "banned",
      });
      const draft = await project(c.id, "draft", { status: "draft" });
      const archived = await project(c.id, "archived", { status: "archived" });
      const other = await community("other-projects");
      let otherProjectId = 0;
      for (let n = 0; n < 51; n++) {
        const doc = await project(other.id, `other-${n}`, {
          voteCount: 10000 + n,
        });
        otherProjectId = Number(doc.id);
      }
      const ctx = {
        deps: m,
        magazineId: magazine.id,
        community: c,
        viewerId: fx.editorId,
        locale: "en" as const,
      };
      const candidates = await m.pickers.searchPickerCandidates(
        "launchpadProject",
        fx.sfx,
        ctx,
      );
      expect(candidates.map((v) => Number(v.input.projectId))).toEqual([
        Number(member.id),
        Number(local.id),
      ]);
      expect(candidates[0]).toMatchObject({
        reference: `launchpadProject:${member.id}`,
        facts: [
          { type: "count", what: "upvotes", value: 2 },
          { type: "byline", name: "Sanne" },
        ],
        openHref: null,
      });
      // An empty query must list community candidates as well.
      const unfiltered = await m.pickers.searchPickerCandidates(
        "launchpadProject",
        "",
        ctx,
      );
      expect(unfiltered.map((v) => Number(v.input.projectId))).toEqual(
        expect.arrayContaining([Number(member.id), Number(local.id)]),
      );
      expect(
        (
          await m.pickers.searchPickerCandidates(
            "launchpadProject",
            `local ${fx.sfx}`,
            ctx,
          )
        ).map((v) => Number(v.input.projectId)),
      ).toEqual([Number(local.id)]);
      for (const projectId of [
        Number(inactive.id),
        Number(draft.id),
        Number(archived.id),
        otherProjectId,
        2147483647,
      ])
        await expect(
          m.issues.setIssueItems(
            m,
            issue,
            [{ kind: "launchpadProject", projectId }],
            issue.updatedAt,
            actor,
          ),
        ).rejects.toMatchObject({
          code: "BAD_REQUEST",
          message: "ITEM_INVALID",
        });
      const saved = await m.issues.setIssueItems(
        m,
        issue,
        [{ kind: "launchpadProject", projectId: Number(member.id) }],
        issue.updatedAt,
        actor,
      );
      expect(saved.items).toMatchObject([
        { blockType: "launchpadProject", projectId: member.id },
      ]);
    }, 60_000);

    it("an unlisted community's project stays private inside a public issue", async () => {
      const { c, magazine, actor, issue } = await issueFixture({
        listed: false,
      });
      const scoped = await project(c.id, "private");
      const unscoped = await project(null, "platform");
      const saved = await m.issues.setIssueItems(
        m,
        issue,
        [
          { kind: "launchpadProject", projectId: Number(scoped.id) },
          { kind: "launchpadProject", projectId: Number(unscoped.id) },
        ],
        issue.updatedAt,
        actor,
      );
      const load = (
        viewerId: string | null,
        access: IssueReaderAccess = "full",
      ) =>
        m.registry.loadIssueItemViews(
          saved.items as Registry.StoredBlock[],
          m.context.itemContextFor(m, {
            magazineId: magazine.id,
            community: c,
            issueId: saved.id,
            locale: "en",
            access,
            viewerId,
          }),
        );
      expect(await load(fx.editorId)).toMatchObject([
        {
          kind: "launchpadProject",
          membersOnly: false,
          project: { title: scoped.title },
        },
        { membersOnly: false, project: { title: unscoped.title } },
      ]);
      for (const viewer of [fx.outsiderId, null])
        expect(await load(viewer)).toMatchObject([
          { project: { title: unscoped.title } },
        ]);
      expect(await load(fx.editorId, "editor")).toMatchObject([
        { membersOnly: true },
        { membersOnly: false },
      ]);
      expect(await load(fx.outsiderId, "editor")).toMatchObject([
        { unavailable: true, reason: "no_access" },
        { project: { title: unscoped.title } },
      ]);
    });

    async function event(
      communityId: string | null,
      status:
        | "published"
        | "draft"
        | "rejected"
        | "cancelled"
        | "completed" = "published",
      label: string = status,
    ) {
      const doc = await m.payload.create({
        collection: "events",
        data: {
          title: `Local event ${label} ${fx.sfx}`,
          slug: `pk-event-${label}-${fx.sfx}`,
          description: {
            root: {
              type: "root",
              children: [
                {
                  type: "paragraph",
                  version: 1,
                  children: [
                    { type: "text", text: "Meet the community", version: 1 },
                  ],
                },
              ],
              direction: null,
              format: "",
              indent: 0,
              version: 1,
            },
          },
          type: "meetup",
          status,
          _status: "published",
          date: "2026-10-24",
          location: "Test Lab",
          communityId,
        },
        context: { skipGeocode: true },
      });
      fx.eventIds.push(Number(doc.id));
      return doc;
    }

    it("an event of an unlisted community loads for members, not for outsiders", async () => {
      const { c, magazine, actor, issue } = await issueFixture({
        listed: false,
      });
      const doc = await event(c.id);
      const saved = await m.issues.setIssueItems(
        m,
        issue,
        [{ kind: "event", eventId: Number(doc.id) }],
        issue.updatedAt,
        actor,
      );
      const load = (
        viewerId: string | null,
        access: IssueReaderAccess = "full",
      ) =>
        m.registry.loadIssueItemViews(
          saved.items as Registry.StoredBlock[],
          m.context.itemContextFor(m, {
            magazineId: magazine.id,
            community: c,
            issueId: saved.id,
            locale: "en",
            access,
            viewerId,
          }),
        );
      expect(await load(fx.editorId)).toMatchObject([
        { kind: "event", membersOnly: false, event: { title: doc.title } },
      ]);
      expect(await load(fx.outsiderId)).toEqual([]);
      expect(await load(null)).toEqual([]);
      expect(await load(fx.editorId, "editor")).toMatchObject([
        { kind: "event", membersOnly: true },
      ]);
      expect(await load(fx.outsiderId, "editor")).toEqual([
        {
          kind: "event",
          itemId: saved.items![0]!.id,
          unavailable: true,
          reason: "no_access",
        },
      ]);
      // The saved reference remains intact when the event is deleted.
      await m.payload.delete({ collection: "events", id: doc.id });
      expect(await load(fx.editorId)).toEqual([]);
      expect(await load(fx.editorId, "editor")).toMatchObject([
        { reason: "missing" },
      ]);
      const kept = await m.issues.setIssueItems(
        m,
        saved,
        [{ kind: "event", eventId: Number(doc.id), intro: "Still our pick" }],
        saved.updatedAt,
        actor,
      );
      expect(kept.items![0]!.intro).toBe("Still our pick");
    });

    it("the events tab offers only this community's listed events", async () => {
      const { c, magazine, actor, issue } = await issueFixture();
      const listed = await event(c.id);
      const cancelled = await event(c.id, "cancelled");
      const completed = await event(c.id, "completed");
      const draft = await event(c.id, "draft");
      const rejected = await event(c.id, "rejected");
      const other = await community("other");
      const otherEvent = await event(other.id, "published", "other");
      const unscoped = await event(null, "published", "hub");
      const ctx = {
        deps: m,
        magazineId: magazine.id,
        community: c,
        viewerId: fx.editorId,
        locale: "en" as const,
      };
      const candidates = await m.pickers.searchPickerCandidates(
        "event",
        "",
        ctx,
      );
      expect(
        candidates.map((v) => Number(v.input.eventId)).sort((a, b) => a - b),
      ).toEqual(
        [listed, cancelled, completed]
          .map((v) => Number(v.id))
          .sort((a, b) => a - b),
      );
      expect(
        (
          await m.pickers.searchPickerCandidates(
            "event",
            `cancelled ${fx.sfx}`,
            ctx,
          )
        ).map((v) => Number(v.input.eventId)),
      ).toEqual([Number(cancelled.id)]);
      for (const doc of [draft, rejected, otherEvent, unscoped]) {
        await expect(
          m.issues.setIssueItems(
            m,
            issue,
            [{ kind: "event", eventId: Number(doc.id) }],
            issue.updatedAt,
            actor,
          ),
        ).rejects.toMatchObject({
          code: "BAD_REQUEST",
          message: "ITEM_INVALID",
        });
      }
    });

    async function thread(
      communityId: string | null,
      label = "discussion",
      isDeleted = false,
    ) {
      const doc = await m.payload.create({
        collection: "forum-threads",
        data: {
          title: `Local thread ${label} ${fx.sfx}`,
          slug: `pk-thread-${label}-${fx.sfx}`,
          content: {
            root: {
              type: "root",
              children: [
                {
                  type: "paragraph",
                  version: 1,
                  children: [
                    {
                      type: "text",
                      text: "Talk with the community",
                      version: 1,
                    },
                  ],
                },
              ],
              direction: null,
              format: "",
              indent: 0,
              version: 1,
            },
          },
          category: "general",
          authorId: fx.editorId,
          authorName: "Sanne",
          replyCount: 42,
          lastActivityAt: "2026-10-24T10:00:00.000Z",
          communityId,
          isDeleted,
        },
      });
      fx.threadIds.push(Number(doc.id));
      return doc;
    }

    it("a thread soft-deleted after it was added becomes a marker", async () => {
      const { c, magazine, actor, issue } = await issueFixture();
      const doc = await thread(c.id);
      const saved = await m.issues.setIssueItems(
        m,
        issue,
        [{ kind: "forumThread", threadId: Number(doc.id) }],
        issue.updatedAt,
        actor,
      );
      const load = (access: IssueReaderAccess) =>
        m.registry.loadIssueItemViews(
          saved.items as Registry.StoredBlock[],
          m.context.itemContextFor(m, {
            magazineId: magazine.id,
            community: c,
            issueId: saved.id,
            locale: "en",
            access,
            viewerId: fx.editorId,
          }),
        );
      expect(await load("full")).toMatchObject([
        {
          kind: "forumThread",
          thread: {
            path: `/communities/${c.slug}/forum/${doc.slug}`,
            title: doc.title,
            replyCount: 42,
            authorName: "Sanne",
          },
        },
      ]);
      await m.payload.update({
        collection: "forum-threads",
        id: doc.id,
        data: { title: "The conversation continues", replyCount: 43 },
      });
      expect(await load("full")).toMatchObject([
        { thread: { title: "The conversation continues", replyCount: 43 } },
      ]);
      await m.payload.update({
        collection: "forum-threads",
        id: doc.id,
        data: { isDeleted: true },
      });
      expect(await load("full")).toEqual([]);
      expect(await load("editor")).toEqual([
        {
          kind: "forumThread",
          itemId: saved.items![0]!.id,
          unavailable: true,
          reason: "missing",
        },
      ]);
      const reloaded = await m.payload.findByID({
        collection: "magazine-issues",
        id: saved.id,
        depth: 0,
      });
      expect(
        m.registry.toItemInputs(reloaded.items as Registry.StoredBlock[]),
      ).toMatchObject([{ kind: "forumThread", threadId: Number(doc.id) }]);
      const kept = await m.issues.setIssueItems(
        m,
        reloaded,
        [
          {
            kind: "forumThread",
            threadId: Number(doc.id),
            intro: "Still our pick",
          },
        ],
        reloaded.updatedAt,
        actor,
      );
      expect(kept.items![0]!.intro).toBe("Still our pick");
    });

    it("the forum tab offers this community's threads only", async () => {
      const { c, magazine, actor, issue } = await issueFixture();
      const first = await thread(c.id, "models");
      const second = await thread(c.id, "tools");
      const deleted = await thread(c.id, "deleted", true);
      const other = await community("other");
      const otherThread = await thread(other.id, "other");
      const unscoped = await thread(null, "hub");
      const ctx = {
        deps: m,
        magazineId: magazine.id,
        community: c,
        viewerId: fx.editorId,
        locale: "en" as const,
      };
      const candidates = await m.pickers.searchPickerCandidates(
        "forumThread",
        "",
        ctx,
      );
      expect(
        candidates.map((v) => Number(v.input.threadId)).sort((a, b) => a - b),
      ).toEqual([Number(first.id), Number(second.id)].sort((a, b) => a - b));
      expect(candidates[0]!.facts).toEqual([
        { type: "count", what: "replies", value: 42 },
        { type: "date", label: "lastActive", at: "2026-10-24T10:00:00.000Z" },
        { type: "byline", name: "Sanne" },
      ]);
      expect(
        (
          await m.pickers.searchPickerCandidates(
            "forumThread",
            `models ${fx.sfx}`,
            ctx,
          )
        ).map((v) => Number(v.input.threadId)),
      ).toEqual([Number(first.id)]);
      for (const doc of [deleted, otherThread, unscoped]) {
        await expect(
          m.issues.setIssueItems(
            m,
            issue,
            [{ kind: "forumThread", threadId: Number(doc.id) }],
            issue.updatedAt,
            actor,
          ),
        ).rejects.toMatchObject({
          code: "BAD_REQUEST",
          message: "ITEM_INVALID",
        });
      }
    });

    it("an unlisted community's thread stays private inside a public issue", async () => {
      const { c, magazine, actor, issue } = await issueFixture({
        listed: false,
      });
      const doc = await thread(c.id);
      const saved = await m.issues.setIssueItems(
        m,
        issue,
        [{ kind: "forumThread", threadId: Number(doc.id) }],
        issue.updatedAt,
        actor,
      );
      const load = (
        viewerId: string | null,
        access: IssueReaderAccess = "full",
      ) =>
        m.registry.loadIssueItemViews(
          saved.items as Registry.StoredBlock[],
          m.context.itemContextFor(m, {
            magazineId: magazine.id,
            community: c,
            issueId: saved.id,
            locale: "en",
            access,
            viewerId,
          }),
        );
      expect(await load(fx.editorId)).toMatchObject([
        {
          kind: "forumThread",
          membersOnly: false,
          thread: { title: doc.title },
        },
      ]);
      expect(await load(fx.outsiderId)).toEqual([]);
      expect(await load(null)).toEqual([]);
      expect(await load(fx.editorId, "editor")).toMatchObject([
        { kind: "forumThread", membersOnly: true },
      ]);
      expect(await load(fx.outsiderId, "editor")).toEqual([
        {
          kind: "forumThread",
          itemId: saved.items![0]!.id,
          unavailable: true,
          reason: "no_access",
        },
      ]);
    });

    it("a story loads live and drops out when unpublished", async () => {
      const { c, magazine, actor, issue } = await issueFixture();
      const storylineId = fx.storyIds[0]!;
      const saved = await m.issues.setIssueItems(
        m,
        issue,
        [{ kind: "storyline", storylineId }],
        issue.updatedAt,
        actor,
      );
      const load = (access: IssueReaderAccess) =>
        m.registry.loadIssueItemViews(
          saved.items as Registry.StoredBlock[],
          m.context.itemContextFor(m, {
            magazineId: magazine.id,
            community: c,
            issueId: saved.id,
            locale: "en",
            access,
            viewerId: access === "editor" ? fx.editorId : null,
          }),
        );
      expect(await load("full")).toMatchObject([
        {
          storyline: {
            title: `Local AI public ${fx.sfx}`,
            sourceCount: 2,
            updatedAt: "2026-10-24T10:00:00.000Z",
          },
        },
      ]);
      const { eq } = await import("drizzle-orm");
      await m.db
        .update(m.schema.newsStorylines)
        .set({ titleEn: "The title changed live" })
        .where(eq(m.schema.newsStorylines.id, storylineId));
      expect(await load("full")).toMatchObject([
        { storyline: { title: "The title changed live" } },
      ]);
      await m.db
        .update(m.schema.newsStorylines)
        .set({ status: "draft" })
        .where(eq(m.schema.newsStorylines.id, storylineId));
      expect(await load("full")).toEqual([]);
      expect(await load("editor")).toEqual([
        {
          kind: "storyline",
          itemId: saved.items![0]!.id,
          unavailable: true,
          reason: "unpublished",
        },
      ]);
      await m.db
        .delete(m.schema.newsStorylines)
        .where(eq(m.schema.newsStorylines.id, storylineId));
      expect(await load("editor")).toMatchObject([{ reason: "missing" }]);
      const reloaded = await m.payload.findByID({
        collection: "magazine-issues",
        id: saved.id,
        depth: 0,
      });
      expect(
        m.registry.toItemInputs(reloaded.items as Registry.StoredBlock[]),
      ).toMatchObject([{ kind: "storyline", storylineId }]);
    });

    it("setIssueItems accepts a public story and refuses a draft one", async () => {
      const { actor, issue } = await issueFixture();
      const storylineId = fx.storyIds[0]!;
      const saved: MagazineIssue = await m.issues.setIssueItems(
        m,
        issue,
        [{ kind: "storyline", storylineId }],
        issue.updatedAt,
        actor,
      );
      expect(
        m.registry.toItemInputs(saved.items as Registry.StoredBlock[]),
      ).toMatchObject([{ kind: "storyline", storylineId }]);
      const draft = await story("draft", "draft");
      await expect(
        m.issues.setIssueItems(
          m,
          saved,
          [{ kind: "storyline", storylineId: draft.id }],
          saved.updatedAt,
          actor,
        ),
      ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "ITEM_INVALID" });
      const { eq } = await import("drizzle-orm");
      await m.db
        .update(m.schema.newsStorylines)
        .set({ status: "draft" })
        .where(eq(m.schema.newsStorylines.id, storylineId));
      const kept = await m.issues.setIssueItems(
        m,
        saved,
        [{ kind: "storyline", storylineId, intro: "Still our pick" }],
        saved.updatedAt,
        actor,
      );
      expect(kept.items![0]!.intro).toBe("Still our pick");
    });

    it("a news item loads live and becomes missing when deleted", async () => {
      const { c, magazine, actor, issue } = await issueFixture();
      const newsItemId = fx.newsIds[0]!;
      const saved = await m.issues.setIssueItems(
        m,
        issue,
        [{ kind: "newsItem", newsItemId, intro: "Our take" }],
        issue.updatedAt,
        actor,
      );
      const load = (access: IssueReaderAccess) =>
        m.registry.loadIssueItemViews(
          saved.items as Registry.StoredBlock[],
          m.context.itemContextFor(m, {
            magazineId: magazine.id,
            community: c,
            issueId: saved.id,
            locale: "en",
            access,
            viewerId: access === "editor" ? fx.editorId : null,
          }),
        );
      expect(await load("full")).toMatchObject([
        {
          kind: "newsItem",
          intro: "Our take",
          news: {
            title: "Local models keep documents on the device 0",
            source: "example.test",
          },
        },
      ]);
      const { eq } = await import("drizzle-orm");
      await m.db
        .update(m.schema.newsItems)
        .set({ title: "The headline changed live" })
        .where(eq(m.schema.newsItems.id, newsItemId));
      expect(await load("full")).toMatchObject([
        { news: { title: "The headline changed live" } },
      ]);
      await m.db
        .delete(m.schema.newsItems)
        .where(eq(m.schema.newsItems.id, newsItemId));
      expect(await load("full")).toEqual([]);
      expect(await load("editor")).toEqual([
        {
          kind: "newsItem",
          itemId: saved.items![0]!.id,
          unavailable: true,
          reason: "missing",
        },
      ]);
      const reloaded = await m.payload.findByID({
        collection: "magazine-issues",
        id: saved.id,
        depth: 0,
      });
      expect(
        m.registry.toItemInputs(reloaded.items as Registry.StoredBlock[]),
      ).toMatchObject([{ kind: "newsItem", newsItemId }]);
      const kept = await m.issues.setIssueItems(
        m,
        reloaded,
        [{ kind: "newsItem", newsItemId, intro: "Still our pick" }],
        reloaded.updatedAt,
        actor,
      );
      expect(kept.items![0]!.intro).toBe("Still our pick");
      await expect(
        m.issues.setIssueItems(
          m,
          kept,
          [{ kind: "newsItem", newsItemId: crypto.randomUUID() }],
          kept.updatedAt,
          actor,
        ),
      ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "ITEM_INVALID" });
    });

    it("the news tab finds headlines by words in the title, including % and _", async () => {
      const { c, magazine } = await issueFixture();
      const [literal, wildcard, underscoreWildcard, undated] = await m.db
        .insert(m.schema.newsItems)
        .values([
          {
            title: `${fx.sfx} Local AI grows 50%_today`,
            url: `https://www.example.com/literal-${fx.sfx}`,
            publishedAt: new Date("2026-11-01T10:00:00.000Z"),
            createdAt: new Date("2026-11-01T09:00:00.000Z"),
          },
          {
            title: `${fx.sfx} Local AI grows 500Xtoday`,
            url: `https://example.com/wildcard-${fx.sfx}`,
            publishedAt: new Date("2026-10-31T10:00:00.000Z"),
            createdAt: new Date("2026-11-02T09:00:00.000Z"),
          },
          {
            title: `${fx.sfx} Local AI grows 50%Xtoday`,
            url: `https://example.com/underscore-${fx.sfx}`,
            publishedAt: new Date("2026-10-31T10:00:00.000Z"),
            createdAt: new Date("2026-11-01T09:00:00.000Z"),
          },
          {
            title: `${fx.sfx} Local AI without a date`,
            url: `https://example.com/undated-${fx.sfx}`,
            publishedAt: null,
            createdAt: new Date("2026-11-03T09:00:00.000Z"),
          },
        ])
        .returning();
      fx.newsIds.push(
        literal!.id,
        wildcard!.id,
        underscoreWildcard!.id,
        undated!.id,
      );
      const ctx = {
        deps: m,
        magazineId: magazine.id,
        community: c,
        viewerId: fx.editorId,
        locale: "en" as const,
      };
      const candidates = await m.pickers.searchPickerCandidates(
        "newsItem",
        `${fx.sfx} local ai`,
        ctx,
      );
      expect(candidates.map((candidate) => candidate.input.newsItemId)).toEqual(
        [literal!.id, wildcard!.id, underscoreWildcard!.id, undated!.id],
      );
      expect(candidates[0]).toMatchObject({
        reference: `newsItem:${literal!.id}`,
        facts: [
          { type: "source", host: "example.com" },
          { type: "date", label: "published", at: "2026-11-01T10:00:00.000Z" },
        ],
        openHref: null,
      });
      for (const [query, expectedIds] of [
        [`${fx.sfx} Local AI grows 50%`, [literal!.id, underscoreWildcard!.id]],
        [`${fx.sfx} Local AI grows 50%_today`, [literal!.id]],
      ] as const) {
        expect(
          (await m.pickers.searchPickerCandidates("newsItem", query, ctx)).map(
            (candidate) => candidate.input.newsItemId,
          ),
        ).toEqual(expectedIds);
      }
      expect(
        await m.pickers.searchPickerCandidates(
          "newsItem",
          `${fx.sfx} title not present`,
          ctx,
        ),
      ).toEqual([]);
    });

    it("the stories tab searches public stories only", async () => {
      const { c, magazine } = await issueFixture();
      await story("draft", "draft");
      await story("unsupported", "published", false);
      const ctx = {
        deps: m,
        magazineId: magazine.id,
        community: c,
        viewerId: fx.editorId,
        locale: "en" as const,
      };
      const candidates = await m.pickers.searchPickerCandidates(
        "storyline",
        fx.sfx,
        ctx,
      );
      expect(candidates).toMatchObject([
        {
          input: { kind: "storyline", storylineId: fx.storyIds[0] },
          reference: `storyline:${fx.storyIds[0]}`,
          facts: [
            { type: "count", what: "sources", value: 2 },
            { type: "date", label: "updated", at: "2026-10-24T10:00:00.000Z" },
          ],
          openHref: null,
        },
      ]);
      expect(candidates).toHaveLength(1);
      expect(
        await m.pickers.searchPickerCandidates("storyline", `${fx.sfx}%`, ctx),
      ).toEqual([]);
    });
  },
);
