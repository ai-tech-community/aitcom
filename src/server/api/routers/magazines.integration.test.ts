// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { magazineArticleEditPath } from "@/lib/magazines/paths";
import {
  roleCan,
  type MagazineCapability,
  type MagazineRole,
} from "@/lib/magazines/roles";
import type { createCaller as CreateCaller } from "@/server/api/root";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type { PayloadClient } from "@/server/magazines/deps";

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

const PROCEDURE_CAPABILITY: Record<string, MagazineCapability | "public"> = {
  getSettings: "manage",
  saveSettings: "manage",
  listStaff: "manage",
  searchStaffCandidates: "manage",
  assignStaffRole: "manage",
  removeStaffRole: "manage",
  listIssues: "edit",
  createIssue: "edit",
  getIssueForEditing: "edit",
  updateIssue: "edit",
  setIssueItems: "edit",
  publishIssue: "edit",
  deleteDraftIssue: "edit",
  pickerCandidates: "edit",
  availableArticles: "edit",
  myDraftArticles: "write",
};

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

/**
 * The editor API (spec 2026-10-26, Task 7): the `magazines` router and the
 * magazine side of the `articles` router, called as each community role.
 */
// Each test drives several procedures end to end (the full flow publishes an
// issue); alone they take up to ~5s, so the 5s default fails under a loaded
// full DB run.
describe.skipIf(!RUN_DB)(
  "magazines editor API [DB integration]",
  { timeout: 30_000 },
  () => {
    type Mods = {
      db: typeof Db;
      schema: typeof Schema;
      createCaller: typeof CreateCaller;
      payload: PayloadClient;
    };
    let m: Mods;

    type Fixture = {
      sfx: string;
      ownerId: string;
      adminId: string;
      moderatorId: string;
      memberId: string;
      outsiderId: string;
      community: { id: string; slug: string };
      other: { id: string; slug: string };
    };
    let fx: Fixture;
    let extraUserIds: string[];

    beforeAll(async () => {
      const [{ db }, schema, { createCaller }, { getPayloadClient }] =
        await Promise.all([
          import("@/server/db"),
          import("@/server/db/schema"),
          import("@/server/api/root"),
          import("@/server/payload"),
        ]);
      m = { db, schema, createCaller, payload: await getPayloadClient() };
    }, 120_000);

    beforeEach(async () => {
      extraUserIds = [];
      const { db, schema } = m;
      const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const ids = {
        ownerId: `mz-owner-${sfx}`,
        adminId: `mz-admin-${sfx}`,
        moderatorId: `mz-mod-${sfx}`,
        memberId: `mz-member-${sfx}`,
        outsiderId: `mz-outsider-${sfx}`,
      };
      await db.insert(schema.user).values(
        Object.values(ids).map((id) => ({
          id,
          email: `${id}@example.test`,
          name: id,
        })),
      );
      await db
        .insert(schema.memberProfiles)
        .values(
          Object.values(ids).map((userId) => ({ userId, displayName: userId })),
        );
      const [community, other] = await db
        .insert(schema.communities)
        .values([
          {
            name: `Magazine ${sfx}`,
            slug: `mz-${sfx}`,
            createdBy: ids.ownerId,
          },
          {
            name: `Other ${sfx}`,
            slug: `mz-other-${sfx}`,
            createdBy: ids.outsiderId,
          },
        ])
        .returning();
      await db.insert(schema.communityMemberships).values([
        { communityId: community!.id, userId: ids.ownerId, role: "owner" },
        { communityId: community!.id, userId: ids.adminId, role: "admin" },
        {
          communityId: community!.id,
          userId: ids.moderatorId,
          role: "moderator",
        },
        { communityId: community!.id, userId: ids.memberId, role: "member" },
        { communityId: other!.id, userId: ids.outsiderId, role: "owner" },
      ]);
      fx = {
        sfx,
        ...ids,
        community: { id: community!.id, slug: community!.slug },
        other: { id: other!.id, slug: other!.slug },
      };
    }, 60_000);

    afterEach(async () => {
      const { db, schema, payload } = m;
      const { inArray } = await import("drizzle-orm");
      const communityIds = [fx.community.id, fx.other.id];
      const userIds = [
        fx.ownerId,
        fx.adminId,
        fx.moderatorId,
        fx.memberId,
        fx.outsiderId,
        ...extraUserIds,
      ];
      await db
        .delete(schema.magazineStaff)
        .where(inArray(schema.magazineStaff.userId, userIds));
      const { docs: mags } = await payload.find({
        collection: "magazines",
        where: { communityId: { in: communityIds } },
        depth: 0,
        pagination: false,
      });
      const magazineIds = mags.map((mag) => mag.id);
      if (magazineIds.length > 0) {
        // Issues first: their article blocks hold a required reference.
        // Deleting the issues clears their articles' placement (the
        // foreign key is ON DELETE set null).
        await payload.delete({
          collection: "magazine-issues",
          where: { magazine: { in: magazineIds } },
        });
      }
      await payload.delete({
        collection: "articles",
        where: { authorId: { in: userIds } },
      });
      if (magazineIds.length > 0) {
        await payload.delete({
          collection: "magazines",
          where: { id: { in: magazineIds } },
        });
      }
      await db
        .delete(schema.spaces)
        .where(inArray(schema.spaces.communityId, communityIds));
      await db
        .delete(schema.communityMemberships)
        .where(inArray(schema.communityMemberships.communityId, communityIds));
      await db
        .delete(schema.communities)
        .where(inArray(schema.communities.id, communityIds));
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

    // ── Helpers ───────────────────────────────────────────────────────────

    function callerAs(userId: string) {
      return m.createCaller({
        db: m.db,
        headers: new Headers(),
        session: { user: { id: userId, name: userId }, session: {} } as never,
      });
    }

    const slug = () => fx.community.slug;

    async function saveMagazine(userId = fx.ownerId) {
      return callerAs(userId).magazines.saveSettings({
        slug: slug(),
        name: "The Gazette",
        magazineSlug: `gazette-${fx.sfx}`,
        topics: ["AI"],
        defaultVisibility: "members",
      });
    }

    async function writeArticle(
      magazineId: number,
      title: string,
      userId = fx.ownerId,
    ) {
      return callerAs(userId).articles.create({
        title,
        slug: title.toLowerCase().replace(/\s+/g, "-"),
        content: richText(`${title} body`),
        type: "article",
        magazineId,
      });
    }

    async function xpOf(userId: string): Promise<number> {
      const { eq } = await import("drizzle-orm");
      const profile = await m.db.query.memberProfiles.findFirst({
        where: eq(m.schema.memberProfiles.userId, userId),
      });
      return Number(profile?.xp ?? 0);
    }

    async function setRole(userId: string, role: "member" | "owner") {
      const { and, eq } = await import("drizzle-orm");
      await m.db
        .update(m.schema.communityMemberships)
        .set({ role })
        .where(
          and(
            eq(m.schema.communityMemberships.communityId, fx.community.id),
            eq(m.schema.communityMemberships.userId, userId),
          ),
        );
    }

    /** An approved article placed in a published issue of the magazine. */
    async function publishedArticle() {
      const magazine = await saveMagazine();
      const owner = callerAs(fx.ownerId);
      const article = await writeArticle(magazine.id, "Placed story");
      await owner.articles.submit({ id: article.id });
      const { id: issueId } = await owner.magazines.createIssue({
        slug: slug(),
        title: "Spring",
      });
      const editing = await owner.magazines.getIssueForEditing({
        slug: slug(),
        issueId,
      });
      const { issue } = await owner.magazines.setIssueItems({
        slug: slug(),
        issueId,
        expectedUpdatedAt: editing.issue.updatedAt,
        items: [{ kind: "article", articleId: article.id }],
      });
      const published = await owner.magazines.publishIssue({
        slug: slug(),
        issueId,
        expectedUpdatedAt: issue.updatedAt,
      });
      return { magazine, article, issue: published };
    }

    // ── Tests ─────────────────────────────────────────────────────────────

    it("pickerCandidates offers ready articles, filtered by the search", async () => {
      const magazine = await saveMagazine();
      const owner = callerAs(fx.ownerId);
      const agents = await writeArticle(magazine.id, "Agents at work");
      const evals = await writeArticle(magazine.id, "Evals", fx.adminId);
      const placed = await writeArticle(magazine.id, "Placed agents");
      await writeArticle(magazine.id, "Draft agents");
      for (const article of [agents, placed]) {
        await owner.articles.submit({ id: article.id });
      }
      await callerAs(fx.adminId).articles.submit({ id: evals.id });

      const { id: issueId } = await owner.magazines.createIssue({
        slug: slug(),
        title: "With agents",
      });
      const { issue } = await owner.magazines.getIssueForEditing({
        slug: slug(),
        issueId,
      });
      await owner.magazines.setIssueItems({
        slug: slug(),
        issueId,
        expectedUpdatedAt: issue.updatedAt,
        items: [{ kind: "article", articleId: placed.id }],
      });

      const candidate = {
        input: { kind: "article", articleId: agents.id },
        reference: `article:${agents.id}`,
        title: "Agents at work",
        facts: [{ type: "byline", name: fx.ownerId }],
        openHref: magazineArticleEditPath(slug(), agents.slug),
      };
      expect(
        await owner.magazines.pickerCandidates({
          slug: slug(),
          kind: "article",
          query: " agent ",
        }),
      ).toEqual([candidate]);
      expect(
        await callerAs(fx.adminId).magazines.pickerCandidates({
          slug: slug(),
          kind: "article",
          query: "agent",
        }),
      ).toEqual([{ ...candidate, openHref: null }]);

      const unfiltered = await owner.magazines.pickerCandidates({
        slug: slug(),
        kind: "article",
      });
      expect(unfiltered).toHaveLength(2);
      expect(unfiltered).toEqual(
        expect.arrayContaining([
          candidate,
          {
            input: { kind: "article", articleId: evals.id },
            reference: `article:${evals.id}`,
            title: "Evals",
            facts: [{ type: "byline", name: fx.adminId }],
            openHref: null,
          },
        ]),
      );
    });

    it("pickerCandidates is for editors only", async () => {
      await saveMagazine();
      await expect(
        callerAs(fx.memberId).magazines.pickerCandidates({
          slug: slug(),
          kind: "article",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("pickerCandidates returns no candidates before the magazine exists", async () => {
      expect(
        await callerAs(fx.ownerId).magazines.pickerCandidates({
          slug: slug(),
          kind: "article",
        }),
      ).toEqual([]);
    });

    it("moderators and members without a job reach no editor procedure", async () => {
      await saveMagazine();
      const { id: issueId } = await callerAs(fx.adminId).magazines.createIssue({
        slug: slug(),
        title: "Admin issue",
      });
      expect(issueId).toBeGreaterThan(0);

      for (const userId of [fx.moderatorId, fx.memberId, fx.outsiderId]) {
        const caller = callerAs(userId).magazines;
        await expect(
          caller.getSettings({ slug: slug() }),
        ).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
        await expect(
          caller.createIssue({ slug: slug(), title: "Nope" }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          caller.publishIssue({
            slug: slug(),
            issueId,
            expectedUpdatedAt: new Date().toISOString(),
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
    });

    async function appointed(magazineId: number, role: MagazineRole) {
      const { db, schema } = m;
      const userId = `mz-appointed-${extraUserIds.length}-${fx.sfx}`;
      extraUserIds.push(userId);
      await db
        .insert(schema.user)
        .values({ id: userId, name: userId, email: `${userId}@example.test` });
      await db
        .insert(schema.memberProfiles)
        .values({ userId, displayName: userId });
      await db
        .insert(schema.communityMemberships)
        .values({ communityId: fx.community.id, userId, role: "member" });
      await db
        .insert(schema.magazineStaff)
        .values({ magazineId, communityId: fx.community.id, userId, role });
      return userId;
    }

    it.each([
      ["staff contributor", "contributor"],
      ["staff editor", "editor"],
      ["appointed editor-in-chief", "editor_in_chief"],
      ["moderator", null],
      ["outsider", null],
    ] as const)(
      "each capability opens exactly its procedures (%s)",
      async (viewer, role) => {
        const { magazinesRouter } = await import("./magazines");
        expect(Object.keys(magazinesRouter._def.procedures).sort()).toEqual(
          Object.keys(PROCEDURE_CAPABILITY).sort(),
        );
        const magazine = await saveMagazine();
        const { id: issueId } = await callerAs(
          fx.ownerId,
        ).magazines.createIssue({ slug: slug(), title: "Gate fixture" });
        const { issue } = await callerAs(
          fx.ownerId,
        ).magazines.getIssueForEditing({ slug: slug(), issueId });
        const userId = role
          ? await appointed(magazine.id, role)
          : viewer === "moderator"
            ? fx.moderatorId
            : fx.outsiderId;
        const caller = callerAs(userId).magazines;
        const ref = { slug: slug(), issueId };
        const write = { ...ref, expectedUpdatedAt: issue.updatedAt };
        const calls: Record<string, () => Promise<unknown>> = {
          getSettings: () => caller.getSettings({ slug: slug() }),
          saveSettings: () =>
            caller.saveSettings({
              slug: slug(),
              name: magazine.name,
              magazineSlug: magazine.slug,
              topics: [],
              defaultVisibility: "members",
            }),
          listStaff: () => caller.listStaff({ slug: slug() }),
          searchStaffCandidates: () =>
            caller.searchStaffCandidates({ slug: slug(), query: "" }),
          assignStaffRole: () =>
            caller.assignStaffRole({
              slug: slug(),
              userId: fx.memberId,
              role: "contributor",
            }),
          removeStaffRole: () =>
            caller.removeStaffRole({ slug: slug(), userId: fx.memberId }),
          listIssues: () => caller.listIssues({ slug: slug() }),
          createIssue: () =>
            caller.createIssue({ slug: slug(), title: "Gate result" }),
          getIssueForEditing: () => caller.getIssueForEditing(ref),
          updateIssue: () =>
            caller.updateIssue({ ...write, title: "Gate updated" }),
          setIssueItems: () => caller.setIssueItems({ ...write, items: [] }),
          publishIssue: () => caller.publishIssue(write),
          pickerCandidates: () =>
            caller.pickerCandidates({ slug: slug(), kind: "article" }),
          availableArticles: () => caller.availableArticles({ slug: slug() }),
          myDraftArticles: () => caller.myDraftArticles({ slug: slug() }),
          deleteDraftIssue: () => caller.deleteDraftIssue(ref),
        };
        expect(Object.keys(calls).sort()).toEqual(
          Object.keys(PROCEDURE_CAPABILITY).sort(),
        );
        for (const [name, call] of Object.entries(calls)) {
          const capability = PROCEDURE_CAPABILITY[name]!;
          if (capability === "public") continue;
          const outcome = await call().then(
            () => null,
            (error: unknown) => error,
          );
          if (roleCan(role, capability))
            expect(outcome, name).not.toMatchObject({ code: "FORBIDDEN" });
          else expect(outcome, name).toMatchObject({ code: "FORBIDDEN" });
        }
      },
    );

    it("an editor cannot give themselves a job", async () => {
      const { eq } = await import("drizzle-orm");
      const magazine = await saveMagazine();
      for (const role of ["editor", "contributor"] as const) {
        const userId = await appointed(magazine.id, role);
        await expect(
          callerAs(userId).magazines.assignStaffRole({
            slug: slug(),
            userId,
            role: "editor_in_chief",
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(
          await m.db.query.magazineStaff.findFirst({
            where: eq(m.schema.magazineStaff.userId, userId),
          }),
        ).toMatchObject({ role });
      }
    });

    it("only community leaders confirm public in an unlisted community", async () => {
      const magazine = await saveMagazine();
      const chief = callerAs(
        await appointed(magazine.id, "editor_in_chief"),
      ).magazines;
      const owner = callerAs(fx.ownerId).magazines;
      const { id: issueId } = await owner.createIssue({
        slug: slug(),
        title: "Public choice",
      });
      const { issue } = await owner.getIssueForEditing({
        slug: slug(),
        issueId,
      });
      const update = {
        slug: slug(),
        issueId,
        expectedUpdatedAt: issue.updatedAt,
        visibility: "public" as const,
        confirmUnlistedPublic: true,
      };
      const settings = {
        slug: slug(),
        name: magazine.name,
        magazineSlug: magazine.slug,
        topics: [],
        defaultVisibility: "public" as const,
        confirmUnlistedPublic: true,
      };
      await expect(chief.updateIssue(update)).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "UNLISTED_PUBLIC_LEADERS_ONLY",
      });
      await expect(chief.saveSettings(settings)).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "UNLISTED_PUBLIC_LEADERS_ONLY",
      });
      expect(await owner.updateIssue(update)).toMatchObject({
        visibility: "public",
        publicConfirmedBy: fx.ownerId,
      });
      expect(await owner.saveSettings(settings)).toMatchObject({
        defaultVisibility: "public",
        publicConfirmedBy: fx.ownerId,
      });
    });

    it("team procedures answer NOT_FOUND before a magazine exists", async () => {
      const caller = callerAs(fx.ownerId).magazines;
      for (const call of [
        () => caller.listStaff({ slug: slug() }),
        () => caller.searchStaffCandidates({ slug: slug(), query: "" }),
        () =>
          caller.assignStaffRole({
            slug: slug(),
            userId: fx.memberId,
            role: "contributor",
          }),
        () => caller.removeStaffRole({ slug: slug(), userId: fx.memberId }),
      ])
        await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("every issue-scoped procedure refuses another community's issue with NOT_FOUND", async () => {
      await saveMagazine();
      const { id: issueId } = await callerAs(fx.ownerId).magazines.createIssue({
        slug: slug(),
        title: "Ours",
      });
      const before = await m.payload.findByID({
        collection: "magazine-issues",
        id: issueId,
        depth: 0,
      });
      // The outsider owns the other community: an editor there, not here.
      await callerAs(fx.outsiderId).magazines.saveSettings({
        slug: fx.other.slug,
        name: "Other",
        magazineSlug: `other-${fx.sfx}`,
        topics: [],
        defaultVisibility: "members",
      });
      const theirs = callerAs(fx.outsiderId).magazines;
      const ref = { slug: fx.other.slug, issueId };
      const write = { ...ref, expectedUpdatedAt: before.updatedAt };
      const calls: [string, () => Promise<unknown>][] = [
        ["getIssueForEditing", () => theirs.getIssueForEditing(ref)],
        [
          "updateIssue",
          () => theirs.updateIssue({ ...write, title: "Taken over" }),
        ],
        [
          "setIssueItems",
          () =>
            theirs.setIssueItems({
              ...write,
              items: [
                {
                  kind: "editorial",
                  heading: "Theirs",
                  body: richText("Theirs"),
                },
              ],
            }),
        ],
        ["publishIssue", () => theirs.publishIssue(write)],
        ["deleteDraftIssue", () => theirs.deleteDraftIssue(ref)],
      ];
      for (const [name, call] of calls) {
        await expect(call(), name).rejects.toMatchObject({
          code: "NOT_FOUND",
        });
      }
      await expect(
        theirs.getIssueForEditing({
          slug: fx.other.slug,
          issueId: 999_999_999,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      // Nothing of it reached the issue.
      const after = await m.payload.findByID({
        collection: "magazine-issues",
        id: issueId,
        depth: 0,
      });
      expect(after.status).toBe("draft");
      expect(after.title).toBe("Ours");
      expect(after.items ?? []).toEqual([]);
      expect(after.updatedAt).toBe(before.updatedAt);
    });

    it("full editor flow: settings → write → mark ready → add → publish", async () => {
      const owner = callerAs(fx.ownerId);
      const settings = await owner.magazines.getSettings({ slug: slug() });
      expect(settings.magazine).toBeNull();
      // The form's opt-in runs on the same community facts as the save.
      expect(settings.community).toEqual({
        slug: slug(),
        isListedInDirectory: !settings.communityIsPrivate,
      });

      const magazine = await saveMagazine();
      expect(magazine.slug).toBe(`gazette-${fx.sfx}`);

      const article = await writeArticle(magazine.id, "Our first story");
      const stored = await m.payload.findByID({
        collection: "articles",
        id: article.id,
        depth: 0,
        draft: true,
      });
      expect(stored.magazine).toBe(magazine.id);
      const draftList = await owner.magazines.myDraftArticles({ slug: slug() });
      expect(draftList.map((a) => a.id)).toEqual([article.id]);

      const xpBefore = await xpOf(fx.ownerId);
      const submitted = await owner.articles.submit({ id: article.id });
      expect(submitted.reviewStatus).toBe("approved");
      expect(submitted.status).toBe("draft");
      expect(await xpOf(fx.ownerId)).toBe(xpBefore);
      // Marking ready is the approval: the staff review queue never sees it.
      const { docs: queue } = await m.payload.find({
        collection: "articles",
        where: { reviewStatus: { equals: "pending_review" } },
        depth: 0,
        pagination: false,
        draft: true,
      });
      expect(queue.map((doc) => doc.id)).not.toContain(article.id);

      expect(
        await owner.magazines.myDraftArticles({ slug: slug() }),
      ).toHaveLength(0);
      const available = await owner.magazines.availableArticles({
        slug: slug(),
      });
      expect(available).toEqual([
        expect.objectContaining({
          id: article.id,
          slug: article.slug,
          title: "Our first story",
          authorName: fx.ownerId,
          // The owner wrote it, so the desk links it to the editor.
          editableByViewer: true,
        }),
      ]);
      // Another editor of the magazine sees it, but cannot open it.
      const asAdmin = await callerAs(fx.adminId).magazines.availableArticles({
        slug: slug(),
      });
      expect(asAdmin).toEqual([
        expect.objectContaining({ id: article.id, editableByViewer: false }),
      ]);

      const { id: issueId } = await owner.magazines.createIssue({
        slug: slug(),
        title: "Spring issue",
      });
      const editing = await owner.magazines.getIssueForEditing({
        slug: slug(),
        issueId,
      });
      expect(editing.items).toEqual([]);
      expect(editing.communityIsPrivate).toBe(true);

      const saved = await owner.magazines.setIssueItems({
        slug: slug(),
        issueId,
        expectedUpdatedAt: editing.issue.updatedAt,
        items: [
          { kind: "article", articleId: article.id },
          {
            kind: "editorial",
            heading: "From the editor",
            body: richText("Hi"),
          },
        ],
      });
      expect(saved.items.map((item) => item.kind)).toEqual([
        "article",
        "editorial",
      ]);
      // Placed: no longer offered for another issue.
      expect(
        await owner.magazines.availableArticles({ slug: slug() }),
      ).toHaveLength(0);

      const listed = await owner.magazines.listIssues({ slug: slug() });
      expect(listed.map((i) => [i.id, i.status])).toEqual([[issueId, "draft"]]);

      const published = await owner.magazines.publishIssue({
        slug: slug(),
        issueId,
        expectedUpdatedAt: saved.issue.updatedAt,
      });
      expect(published.status).toBe("published");

      const live = await m.payload.findByID({
        collection: "articles",
        id: article.id,
        depth: 0,
      });
      expect(live.status).toBe("published");
      // Credited once, on publish.
      expect(await xpOf(fx.ownerId)).toBeGreaterThan(xpBefore);
    });

    it("getIssueForEditing returns stored items and their problems", async () => {
      const owner = callerAs(fx.ownerId);
      const magazine = await saveMagazine();
      const article = await writeArticle(magazine.id, "Ready story");
      await owner.articles.submit({ id: article.id });
      const { id: issueId } = await owner.magazines.createIssue({
        slug: slug(),
        title: "Summer",
      });
      const first = await owner.magazines.getIssueForEditing({
        slug: slug(),
        issueId,
      });
      await owner.magazines.setIssueItems({
        slug: slug(),
        issueId,
        expectedUpdatedAt: first.issue.updatedAt,
        items: [{ kind: "article", articleId: article.id, intro: "Read this" }],
      });
      // The article goes back to work after it was placed.
      await m.payload.update({
        collection: "articles",
        id: article.id,
        data: { reviewStatus: "changes_requested" },
        draft: true,
      });

      const editing = await owner.magazines.getIssueForEditing({
        slug: slug(),
        issueId,
      });
      expect(editing.storedItems).toEqual([
        {
          kind: "article",
          id: expect.any(String),
          articleId: article.id,
          intro: "Read this",
        },
      ]);
      expect(editing.problems).toEqual([
        expect.objectContaining({ itemIndex: 0, code: "ARTICLE_NOT_READY" }),
      ]);
      // The builder's kicker, reading link, preview and opt-in dry run
      // read these.
      expect(editing.magazine).toEqual({
        name: "The Gazette",
        slug: `gazette-${fx.sfx}`,
      });
      expect(editing.community).toEqual({
        name: `Magazine ${fx.sfx}`,
        slug: slug(),
        isListedInDirectory: false,
      });
    });

    it("the issue builder page lets in only editors of the issue's community", async () => {
      const { canEditIssueAt } =
        await import("@/server/magazines/issue-editing");
      await saveMagazine();
      const { id: issueId } = await callerAs(fx.ownerId).magazines.createIssue({
        slug: slug(),
        title: "Gate",
      });
      const deps = { db: m.db, payload: m.payload };
      const at = (
        viewerId: string | null,
        communitySlug = slug(),
        id = issueId,
      ) => canEditIssueAt(deps, { communitySlug, issueId: id, viewerId });

      expect(await at(fx.ownerId)).toBe(true);
      expect(await at(fx.adminId)).toBe(true);
      expect(await at(fx.moderatorId)).toBe(false);
      expect(await at(fx.memberId)).toBe(false);
      expect(await at(fx.outsiderId)).toBe(false);
      expect(await at(null)).toBe(false);
      // The issue must belong to the community in the URL.
      expect(await at(fx.outsiderId, fx.other.slug)).toBe(false);
      expect(await at(fx.ownerId, fx.other.slug)).toBe(false);
      expect(await at(fx.ownerId, slug(), 999_999_999)).toBe(false);
      expect(await at(fx.ownerId, `missing-${fx.sfx}`)).toBe(false);
    });

    it("the magazine write and edit pages let in only editors, and only the author edits", async () => {
      const { loadMagazineWriting, loadMagazineArticleForEditing } =
        await import("@/server/magazines/magazine-articles");
      const deps = { db: m.db, payload: m.payload };
      const write = (viewerId: string | null, communitySlug = slug()) =>
        loadMagazineWriting(deps, { communitySlug, viewerId });

      // No magazine yet: nobody writes for it.
      expect(await write(fx.ownerId)).toBeNull();

      const magazine = await saveMagazine();
      const expected = {
        magazineId: magazine.id,
        magazineName: "The Gazette",
        handIn: "mark_ready",
      };
      expect(await write(fx.ownerId)).toEqual(expected);
      expect(await write(fx.adminId)).toEqual(expected);
      for (const viewerId of [
        fx.moderatorId,
        fx.memberId,
        fx.outsiderId,
        null,
      ]) {
        expect(await write(viewerId)).toBeNull();
      }
      expect(await write(fx.outsiderId, fx.other.slug)).toBeNull();
      expect(await write(fx.ownerId, `missing-${fx.sfx}`)).toBeNull();

      const article = await writeArticle(magazine.id, "Owl notes");
      const blog = await callerAs(fx.ownerId).articles.create({
        title: "Blog owl",
        slug: "blog-owl",
        content: richText("blog"),
        type: "article",
      });
      const edit = (
        viewerId: string | null,
        articleSlug = article.slug,
        communitySlug = slug(),
      ) =>
        loadMagazineArticleForEditing(deps, {
          communitySlug,
          articleSlug,
          viewerId,
        });

      expect(await edit(fx.ownerId)).toMatchObject({
        ...expected,
        article: { id: article.id, title: "Owl notes" },
      });
      // Another editor of the same magazine is not its author.
      expect(await edit(fx.adminId)).toBeNull();
      expect(await edit(fx.memberId)).toBeNull();
      // A blog article is not edited from the magazine.
      expect(await edit(fx.ownerId, blog.slug)).toBeNull();
      expect(await edit(fx.ownerId, `missing-${fx.sfx}`)).toBeNull();
      // Not under another community's address.
      expect(await edit(fx.ownerId, article.slug, fx.other.slug)).toBeNull();
      // An author who stops being an editor no longer opens it.
      await setRole(fx.ownerId, "member");
      expect(await edit(fx.ownerId)).toBeNull();
    });

    it("updateIssue takes the issue slug as issueSlug and validates slugs", async () => {
      const owner = callerAs(fx.ownerId);
      await expect(
        owner.magazines.saveSettings({
          slug: slug(),
          name: "Bad",
          magazineSlug: "Not A Slug",
          topics: [],
          defaultVisibility: "members",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      await saveMagazine();
      const { id: issueId } = await owner.magazines.createIssue({
        slug: slug(),
        title: "Autumn",
      });
      const { issue } = await owner.magazines.getIssueForEditing({
        slug: slug(),
        issueId,
      });
      await expect(
        owner.magazines.updateIssue({
          slug: slug(),
          issueId,
          expectedUpdatedAt: issue.updatedAt,
          issueSlug: "ab",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      const updated = await owner.magazines.updateIssue({
        slug: slug(),
        issueId,
        expectedUpdatedAt: issue.updatedAt,
        issueSlug: "autumn-special",
        title: "Autumn special",
      });
      expect(updated.slug).toBe("autumn-special");
      expect(updated.title).toBe("Autumn special");

      await expect(
        owner.magazines.updateIssue({
          slug: slug(),
          issueId,
          expectedUpdatedAt: issue.updatedAt,
          title: "Stale",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT", message: "ISSUE_CHANGED" });
    });

    it("deleteDraftIssue removes a draft and frees its articles", async () => {
      const owner = callerAs(fx.ownerId);
      const magazine = await saveMagazine();
      const article = await writeArticle(magazine.id, "Freed story");
      await owner.articles.submit({ id: article.id });
      const { id: issueId } = await owner.magazines.createIssue({
        slug: slug(),
        title: "Draft only",
      });
      const { issue } = await owner.magazines.getIssueForEditing({
        slug: slug(),
        issueId,
      });
      await owner.magazines.setIssueItems({
        slug: slug(),
        issueId,
        expectedUpdatedAt: issue.updatedAt,
        items: [{ kind: "article", articleId: article.id }],
      });
      expect(
        await owner.magazines.deleteDraftIssue({ slug: slug(), issueId }),
      ).toEqual({ ok: true });
      expect(await owner.magazines.listIssues({ slug: slug() })).toEqual([]);
      expect(
        (await owner.magazines.availableArticles({ slug: slug() })).map(
          (a) => a.id,
        ),
      ).toEqual([article.id]);
    });

    it("magazine articles are not in My articles", async () => {
      const owner = callerAs(fx.ownerId);
      const magazine = await saveMagazine();
      const article = await writeArticle(magazine.id, "Magazine only");
      const blog = await owner.articles.create({
        title: "Blog post",
        slug: "blog-post",
        content: richText("blog"),
        type: "article",
      });
      const mine = await owner.articles.myArticles();
      const ids = mine.map((doc) => doc.id);
      expect(ids).toContain(blog.id);
      expect(ids).not.toContain(article.id);
    });

    it("a member who is not an editor cannot create a magazine article", async () => {
      const magazine = await saveMagazine();
      for (const userId of [fx.memberId, fx.moderatorId, fx.outsiderId]) {
        await expect(
          writeArticle(magazine.id, "Sneaky story", userId),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
    });

    it("an author who stops being an editor cannot mark ready or edit", async () => {
      const magazine = await saveMagazine();
      const article = await writeArticle(magazine.id, "Orphan", fx.adminId);
      await setRole(fx.adminId, "member");
      const admin = callerAs(fx.adminId);
      await expect(
        admin.articles.submit({ id: article.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        admin.articles.update({ id: article.id, title: "Still mine?" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("an editor may fix a published magazine article", async () => {
      const { article } = await publishedArticle();
      const updated = await callerAs(fx.ownerId).articles.update({
        id: article.id,
        title: "Placed story, fixed",
      });
      expect(updated.title).toBe("Placed story, fixed");
      expect(updated.status).toBe("published");
    });

    it("the channel lock thrown inside a Payload save is recognisable", async () => {
      const { isArticleMagazineLocked } =
        await import("@/server/articles/channels");
      const magazine = await saveMagazine();
      const article = await writeArticle(magazine.id, "Locked story");
      let thrown: unknown;
      try {
        await m.payload.update({
          collection: "articles",
          id: article.id,
          data: { magazine: null },
          draft: true,
        });
      } catch (error) {
        thrown = error;
      }
      expect(isArticleMagazineLocked(thrown)).toBe(true);
    });

    it("deleting a placed draft article is refused with ARTICLE_PLACED", async () => {
      const owner = callerAs(fx.ownerId);
      const magazine = await saveMagazine();
      const article = await writeArticle(magazine.id, "Held story");
      await owner.articles.submit({ id: article.id });
      const { id: issueId } = await owner.magazines.createIssue({
        slug: slug(),
        title: "Holding",
      });
      const { issue } = await owner.magazines.getIssueForEditing({
        slug: slug(),
        issueId,
      });
      await owner.magazines.setIssueItems({
        slug: slug(),
        issueId,
        expectedUpdatedAt: issue.updatedAt,
        items: [{ kind: "article", articleId: article.id }],
      });
      await expect(
        owner.articles.delete({ id: article.id }),
      ).rejects.toMatchObject({ code: "CONFLICT", message: "ARTICLE_PLACED" });
    });
  },
);
