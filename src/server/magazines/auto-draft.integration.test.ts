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

import { DEFAULT_AUTO_DRAFT_SETTINGS } from "@/lib/magazines/auto-draft";
import { issueBuilderPath } from "@/lib/magazines/paths";
import type { Magazine } from "@/payload-types";
import type { createCaller } from "@/server/api/root";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import type * as Schema from "@/server/db/schema";

import { isLocalDbConfigured } from "@/test/magazine-auto-draft-fixture";
import type { Deps } from "./deps";
import type * as IssueJobs from "./issue-jobs";
import type * as Reading from "./reading";
import type { MagazineMailer } from "./subscriptions/mail";

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

const baseTime = new Date("2026-10-27T12:00:00Z");
const at = (minutes: number) => new Date(baseTime.getTime() + minutes * 60_000);
const day = 24 * 60;

describe.skipIf(!isLocalDbConfigured())(
  "automatic magazine draft guarantees [DB integration]",
  { timeout: 60_000 },
  () => {
    let m: Deps & {
      schema: typeof Schema;
      createCaller: typeof createCaller;
      runMagazineIssueJobs: typeof IssueJobs.runMagazineIssueJobs;
      loadIssuePage: typeof Reading.loadIssuePage;
    };
    let fx: {
      suffix: string;
      ownerId: string;
      adminId: string;
      editorId: string;
      memberId: string;
      outsiderId: string;
      userIds: string[];
      communityId?: string;
      slug: string;
      magazine?: Magazine;
      threadIds: number[];
      eventIds: number[];
    };
    const send = vi.fn(async () => true);
    const mailer: MagazineMailer = {
      send,
      recipient: (to) => to,
      sleep: async () => undefined,
    };

    beforeAll(async () => {
      const [
        { db },
        schema,
        { createCaller },
        { getPayloadClient },
        { runMagazineIssueJobs },
        { loadIssuePage },
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/payload"),
        import("./issue-jobs"),
        import("./reading"),
      ]);
      const { rows } = await db.execute<{ name: string }>(
        sql`select current_database() as name`,
      );
      if (rows[0]?.name !== "aitcom_test")
        throw new Error("Automatic draft guarantees require aitcom_test");
      m = {
        db,
        schema,
        createCaller,
        payload: await getPayloadClient(),
        runMagazineIssueJobs,
        loadIssuePage,
      };
    }, 120_000);

    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(baseTime);
      vi.stubEnv("BETTER_AUTH_SECRET", "automatic-draft-guarantee-test-secret");
      send.mockClear();
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const ids = {
        ownerId: `adg-owner-${suffix}`,
        adminId: `adg-admin-${suffix}`,
        editorId: `adg-editor-${suffix}`,
        memberId: `adg-member-${suffix}`,
        outsiderId: `adg-outsider-${suffix}`,
      };
      fx = {
        suffix,
        ...ids,
        userIds: Object.values(ids),
        slug: `adg-${suffix}`,
        threadIds: [],
        eventIds: [],
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
      const [community] = await m.db
        .insert(m.schema.communities)
        .values({
          name: "The garden club",
          slug: fx.slug,
          createdBy: fx.ownerId,
          isListedInDirectory: false,
        })
        .returning();
      fx.communityId = community!.id;
      await m.db.insert(m.schema.communityMemberships).values(
        [fx.ownerId, fx.adminId, fx.editorId, fx.memberId].map((userId) => ({
          communityId: community!.id,
          userId,
          role:
            userId === fx.ownerId
              ? ("owner" as const)
              : userId === fx.adminId
                ? ("admin" as const)
                : ("member" as const),
          joinedAt: at(-60 * day),
        })),
      );
      const owner = callerAs(fx.ownerId).magazines;
      fx.magazine = await owner.saveSettings({
        slug: fx.slug,
        name: "The Gazette",
        magazineSlug: fx.slug,
        topics: [],
        defaultVisibility: "members",
      });
      await owner.assignStaffRole({
        slug: fx.slug,
        userId: fx.editorId,
        role: "editor",
      });
    }, 60_000);

    afterEach(async () => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      if (!fx) return;
      const { db, payload, schema: s } = m;
      if (fx.magazine) {
        await db
          .delete(s.magazineReads)
          .where(eq(s.magazineReads.magazineId, fx.magazine.id));
        await db
          .delete(s.magazineSubscriptions)
          .where(eq(s.magazineSubscriptions.magazineId, fx.magazine.id));
        await payload.delete({
          collection: "magazine-issues",
          where: { magazine: { equals: fx.magazine.id } },
        });
        await payload.delete({
          collection: "articles",
          where: { authorId: { in: fx.userIds } },
        });
        await payload.delete({ collection: "magazines", id: fx.magazine.id });
      }
      if (fx.threadIds.length) {
        await payload.delete({
          collection: "forum-replies",
          where: { thread: { in: fx.threadIds } },
        });
        await payload.delete({
          collection: "forum-threads",
          where: { id: { in: fx.threadIds } },
        });
      }
      if (fx.eventIds.length)
        await payload.delete({
          collection: "events",
          where: { id: { in: fx.eventIds } },
        });
      await db
        .delete(s.magazineStaff)
        .where(inArray(s.magazineStaff.userId, fx.userIds));
      if (fx.communityId) {
        await db
          .delete(s.spaces)
          .where(eq(s.spaces.communityId, fx.communityId));
        await db
          .delete(s.communityMemberships)
          .where(eq(s.communityMemberships.communityId, fx.communityId));
        await db
          .delete(s.communities)
          .where(eq(s.communities.id, fx.communityId));
      }
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

    function callerAs(userId: string) {
      return m.createCaller({
        db: m.db,
        headers: new Headers(),
        session: { user: { id: userId, name: userId }, session: {} } as never,
      });
    }
    function run(minutes: number) {
      vi.setSystemTime(at(minutes));
      return m.runMagazineIssueJobs(m, { now: at(minutes), mailer });
    }
    async function article(label: string) {
      const doc = await m.payload.create({
        collection: "articles",
        draft: true,
        data: {
          title: `Article ${label} ${fx.suffix}`,
          slug: `adg-${label}-${fx.suffix}`,
          content: plainTextToLexical(`Article ${label}`),
          type: "article",
          authorId: fx.memberId,
          authorName: "Sanne",
          authorType: "member",
          magazine: fx.magazine!.id,
          reviewStatus: "approved",
          status: "draft",
        },
      });
      return Number(doc.id);
    }
    async function thread(label: string, replies: number) {
      const doc = await m.payload.create({
        collection: "forum-threads",
        data: {
          title: `Private thread ${label} ${fx.suffix}`,
          slug: `adg-thread-${label}-${fx.suffix}`,
          content: plainTextToLexical("Talk together"),
          category: "general",
          authorId: fx.memberId,
          authorName: "Sanne",
          communityId: fx.communityId,
          replyCount: replies,
          lastActivityAt: new Date().toISOString(),
        },
      });
      fx.threadIds.push(Number(doc.id));
      for (let i = 0; i < replies; i++)
        await m.payload.create({
          collection: "forum-replies",
          data: {
            thread: Number(doc.id),
            content: plainTextToLexical(`Reply ${i + 1}`),
            authorId: fx.memberId,
            communityId: fx.communityId,
          },
        });
      return Number(doc.id);
    }

    it.each(["cover-story", "long-read", "digest"] as const)(
      "automatic drafts accept and use every layout (%s)",
      async (layout) => {
        const owner = callerAs(fx.ownerId).magazines;
        expect(
          await owner.saveAutoDraftSettings({
            ...DEFAULT_AUTO_DRAFT_SETTINGS,
            slug: fx.slug,
            enabled: true,
            layout,
          }),
        ).toMatchObject({ layout });
        await article("one");
        await article("two");
        await article("three");
        const made = await callerAs(fx.editorId).magazines.makeAutoDraftNow({
          slug: fx.slug,
        });
        expect(made.status).toBe("made");
        if (made.status !== "made")
          throw new Error("Expected an automatic draft");
        const loaded = await owner.getIssueForEditing({
          slug: fx.slug,
          issueId: made.issueId,
        });
        expect(loaded.issue.layout).toBe(layout);
      },
    );

    it("from settings to an automatic issue, with people in control", async () => {
      const slug = fx.slug;
      const owner = callerAs(fx.ownerId).magazines;
      const editor = callerAs(fx.editorId).magazines;

      // 1. Only a manager can opt this unlisted community into public drafts.
      const settings = {
        ...DEFAULT_AUTO_DRAFT_SETTINGS,
        slug,
        enabled: true,
        cadence: "weekly" as const,
        weekday: 1,
        lookBack: "since_last_issue" as const,
        visibility: "public" as const,
        confirmUnlistedPublic: true,
        whenReady: "auto_publish" as const,
        autoPublishDays: 3,
      };
      expect(await owner.saveAutoDraftSettings(settings)).toMatchObject({
        enabled: true,
        cadence: "weekly",
        weekday: 1,
        lookBack: "since_last_issue",
        visibility: "public",
        publicConfirmedBy: fx.ownerId,
        publicConfirmedAt: baseTime.toISOString(),
        whenReady: "auto_publish",
        autoPublishDays: 3,
        neverReuse: true,
      });
      await expect(
        editor.saveAutoDraftSettings(settings),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await editor.autoDraftSettings({ slug })).toMatchObject({
        canManage: false,
        communityIsPrivate: true,
        nextDraftAt: "2026-11-02T00:00:00.000Z",
      });

      // 2. Content belongs to this community and its magazine.
      const firstArticles = [await article("one"), await article("two")];
      const firstThread = await thread("first", 4);
      const event = await m.payload.create({
        collection: "events",
        data: {
          title: `Coming event ${fx.suffix}`,
          slug: `adg-event-${fx.suffix}`,
          description: plainTextToLexical("Meet together"),
          type: "meetup",
          status: "published",
          date: "2026-11-04T00:00:00Z",
          communityId: fx.communityId,
          location: "Test Lab",
        },
        context: { skipGeocode: true },
      });
      fx.eventIds.push(Number(event.id));

      // 3. The next Monday makes a scheduled issue and tells every editor.
      expect(await run(6 * day)).toMatchObject({ drafted: 1, published: 0 });
      const listed = await editor.listIssues({ slug });
      expect(listed).toHaveLength(1);
      const issueId = listed[0]!.id;
      const view = await editor.getIssueForEditing({ slug, issueId });
      expect(view.issue).toMatchObject({
        status: "scheduled",
        scheduledVia: "auto",
        scheduledBy: fx.ownerId,
        scheduledFor: at(9 * day).toISOString(),
        visibility: "public",
        publicConfirmedBy: fx.ownerId,
        publicConfirmedAt: baseTime.toISOString(),
      });
      expect(view.storedItems).toMatchObject([
        { kind: "article", articleId: firstArticles[0] },
        { kind: "article", articleId: firstArticles[1] },
        { kind: "event", eventId: Number(event.id) },
        { kind: "forumThread", threadId: firstThread },
      ]);
      expect(view.autoDraft).not.toBeNull();
      expect(
        Object.values(view.autoDraft!.reasons)
          .map((reason) => reason.type)
          .sort(),
      ).toEqual([
        "eventComingUp",
        "mostReplies",
        "waitingSince",
        "waitingSince",
      ]);
      const notices = await m.db
        .select()
        .from(m.schema.notifications)
        .where(
          and(
            eq(m.schema.notifications.communityId, fx.communityId!),
            eq(m.schema.notifications.type, "magazine_auto_draft_ready"),
          ),
        );
      expect(notices.map((notice) => notice.userId).sort()).toEqual(
        [fx.ownerId, fx.adminId, fx.editorId].sort(),
      );
      for (const notice of notices)
        expect(notice.metadata).toMatchObject({
          issueId,
          reviewPath: issueBuilderPath(slug, issueId),
        });
      const readAs = (viewerId: string | null) =>
        m.loadIssuePage(m, {
          magazineSlug: fx.magazine!.slug,
          issueSlug: view.issue.slug,
          viewerId,
          locale: "en",
        });
      expect(await readAs(fx.outsiderId)).toBeNull();

      // 4. Reordering one minute before publication stops the automatic schedule.
      vi.setSystemTime(at(9 * day - 1));
      const reordered = [...view.storedItems].reverse();
      const edited = await editor.setIssueItems({
        slug,
        issueId,
        expectedUpdatedAt: view.issue.updatedAt,
        items: reordered,
      });
      expect(edited.issue).toMatchObject({
        status: "draft",
        scheduledFor: null,
        scheduledBy: null,
        scheduledVia: null,
      });
      expect(await run(9 * day + 1)).toMatchObject({
        drafted: 0,
        published: 0,
      });
      const stopped = await editor.getIssueForEditing({ slug, issueId });
      expect(stopped.issue.status).toBe("draft");
      expect(stopped.storedItems).toEqual(reordered);
      expect((await editor.autoDraftHistory({ slug }))[0]).toMatchObject({
        actorName: fx.editorId,
        detail: { event: "auto_publish_stopped", why: "edited" },
      });

      // 5. The editor's own schedule uses the ordinary publication path.
      const scheduled = await editor.scheduleIssue({
        slug,
        issueId,
        expectedUpdatedAt: stopped.issue.updatedAt,
        publishAt: at(9 * day + 60).toISOString(),
      });
      expect(scheduled).toMatchObject({
        status: "scheduled",
        scheduledVia: "schedule",
        scheduledBy: fx.editorId,
      });
      expect(await run(9 * day + 65)).toMatchObject({
        drafted: 0,
        published: 1,
        failed: 0,
      });
      const published = await editor.getIssueForEditing({ slug, issueId });
      expect(published.issue).toMatchObject({
        status: "published",
        publishedVia: "schedule",
        publishedBy: fx.editorId,
        publishedAt: at(9 * day + 65).toISOString(),
      });
      expect((await editor.autoDraftHistory({ slug }))[0]).toMatchObject({
        actorName: fx.editorId,
        detail: { event: "published", origin: "schedule" },
      });

      // 6. Readers get neither pick reasons nor another audience's content.
      for (const viewerId of [null, fx.outsiderId, fx.memberId]) {
        const page = await readAs(viewerId);
        expect(page).not.toBeNull();
        expect(page!.issue.status).toBe("published");
        const json = JSON.stringify(page);
        for (const secret of [
          '"reason":',
          '"autoDraft":',
          "Picked because",
          "waitingSince",
          "mostReplies",
          "eventComingUp",
        ])
          expect(json).not.toContain(secret);
        if (viewerId === fx.memberId) {
          expect(page!.items).toMatchObject([
            {
              kind: "forumThread",
              thread: {
                title: `Private thread first ${fx.suffix}`,
                replyCount: 4,
              },
            },
            { kind: "event", event: { slug: event.slug } },
            { kind: "article" },
            { kind: "article" },
          ]);
        } else {
          expect(page!.items.map((item) => item.kind)).toEqual([
            "article",
            "article",
          ]);
          expect(json).not.toContain(`Private thread first ${fx.suffix}`);
          expect(json).not.toContain(event.title);
        }
      }

      // 7. Since-last-issue plus never-reuse picks exactly the three new references.
      vi.setSystemTime(at(9 * day + 70));
      const newThreads = [await thread("second", 3), await thread("third", 2)];
      const newArticle = await article("new");
      vi.setSystemTime(at(9 * day + 80));
      const made = await editor.makeAutoDraftNow({ slug });
      expect(made).toMatchObject({ status: "made", itemCount: 3 });
      if (made.status !== "made")
        throw new Error("Expected a new automatic draft");
      expect(made.issueId).not.toBe(issueId);
      const second = await editor.getIssueForEditing({
        slug,
        issueId: made.issueId,
      });
      expect(second.storedItems).toMatchObject([
        { kind: "article", articleId: newArticle },
        { kind: "forumThread", threadId: newThreads[0] },
        { kind: "forumThread", threadId: newThreads[1] },
      ]);
      expect(second.storedItems).toHaveLength(3);

      // 8. History is newest first, including tied events from the same save.
      const history = await editor.autoDraftHistory({ slug });
      expect(history).toMatchObject([
        {
          actorName: fx.editorId,
          detail: { event: "draft_made", trigger: "manual", itemCount: 3 },
          issue: { id: made.issueId },
        },
        {
          actorName: fx.editorId,
          detail: { event: "published", origin: "schedule" },
          issue: { id: issueId },
        },
        {
          actorName: fx.editorId,
          detail: { event: "auto_publish_stopped", why: "edited" },
          issue: { id: issueId },
        },
        {
          actorName: fx.editorId,
          detail: { event: "items_changed", itemCount: 4 },
          issue: { id: issueId },
        },
        {
          actorName: null,
          detail: { event: "draft_made", trigger: "schedule", itemCount: 4 },
          issue: { id: issueId },
        },
      ]);
      expect(history).toHaveLength(5);
      for (let i = 1; i < history.length; i++)
        expect(
          new Date(history[i - 1]!.createdAt).getTime(),
        ).toBeGreaterThanOrEqual(new Date(history[i]!.createdAt).getTime());
      expect(history[2]!.createdAt).toBe(history[3]!.createdAt);
      expect(Number(history[2]!.id)).toBeGreaterThan(Number(history[3]!.id));
      expect(send).not.toHaveBeenCalled();
    });
  },
);
