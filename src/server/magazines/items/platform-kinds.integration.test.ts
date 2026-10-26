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
        communityIds: [],
        storyIds: [],
        newsIds: [],
      };
      await m.db.insert(m.schema.user).values({
        id: fx.editorId,
        email: `${fx.editorId}@example.test`,
        name: "Editor",
      });
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
      await db.delete(schema.user).where(eq(schema.user.id, fx.editorId));
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

    async function issueFixture() {
      const c = await community("stories");
      const magazine = await m.magazines.saveMagazineSettings(
        m,
        c,
        {
          name: `Platform ${fx.sfx}`,
          slug: `pk-${fx.sfx}`,
          topics: [],
          defaultVisibility: "public",
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
