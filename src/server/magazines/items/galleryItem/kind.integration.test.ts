// @vitest-environment node
/**
 * DB-INTEGRATION test for the `galleryItem` issue item kind against a REAL
 * local DB + Payload: the featurable rule and the gallery read rule as
 * Postgres runs them, an issue save that stores only the item id, and live
 * per-reader loading, with a fake object storage that records the links.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/magazines/items/galleryItem/kind.integration.test.ts
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { DELETED_AUTHOR_ID } from "@/lib/account-deletion";
import type { eq as Eq, inArray as InArray, sql as Sql } from "drizzle-orm";

import type { IssueReaderAccess } from "@/lib/magazines/access";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { PayloadClient } from "../../deps";
import type * as Issues from "../../issue-service";
import type * as Magazines from "../../magazine-service";
import type * as Context from "../context";
import type * as Pickers from "../pickers";
import type * as Registry from "../registry";

// Vitest resolves next-intl's client entry. Keep the real message formatter,
// without the request wrapper, in these Node tests.
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/i18n/messages");
  return {
    getTranslations: async ({ locale }: { locale: "en" | "nl" }) =>
      createTranslator({ locale, messages: await loadMessages(locale) }),
  };
});

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
  "gallery item kind [DB integration]",
  () => {
    const storage = {
      presignUpload: vi.fn(),
      inspect: vi.fn(),
      signedGetUrl: vi.fn(async (key: string) => `https://signed.test/${key}`),
      publicUrl: vi.fn((key: string) => `https://public.test/${key}`),
      list: vi.fn(),
      remove: vi.fn(async () => undefined),
    };
    let m: {
      db: typeof Db;
      payload: PayloadClient;
      storage: () => never;
      schema: typeof Schema;
      issues: typeof Issues;
      magazines: typeof Magazines;
      registry: typeof Registry;
      pickers: typeof Pickers;
      context: typeof Context;
      sql: typeof Sql;
      eq: typeof Eq;
      inArray: typeof InArray;
    };
    let fx: {
      sfx: string;
      editorId: string;
      uploaderId: string;
      memberId: string;
      outsiderId: string;
      community: typeof Schema.communities.$inferSelect;
      communityId: string;
      eventIds: number[];
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
        drizzle,
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("../../issue-service"),
        import("../../magazine-service"),
        import("../registry"),
        import("../pickers"),
        import("../context"),
        import("@/server/payload"),
        import("drizzle-orm"),
      ]);
      const { rows } = await database.db.execute<{ name: string }>(
        drizzle.sql`select current_database() as name`,
      );
      if (rows[0]?.name !== "aitcom_test")
        throw new Error(
          `Refusing to test "${rows[0]?.name}"; use aitcom_test.`,
        );
      m = {
        db: database.db,
        payload: await getPayloadClient(),
        storage: () => storage as never,
        schema,
        issues,
        magazines,
        registry,
        pickers,
        context,
        sql: drizzle.sql,
        eq: drizzle.eq,
        inArray: drizzle.inArray,
      };
    }, 120_000);

    beforeEach(async () => {
      vi.stubEnv("COMMUNITY_PAYMENTS_ENABLED", "false");
      storage.signedGetUrl.mockClear();
      const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const ids = {
        editorId: `gk-editor-${sfx}`,
        uploaderId: `gk-uploader-${sfx}`,
        memberId: `gk-member-${sfx}`,
        outsiderId: `gk-outsider-${sfx}`,
      };
      await m.db.insert(m.schema.user).values(
        Object.values(ids).map((id) => ({
          id,
          email: `${id}@example.test`,
          name: id === ids.uploaderId ? "Dana" : "Reader",
        })),
      );
      const [c] = await m.db
        .insert(m.schema.communities)
        .values({
          name: `Gallery magazine ${sfx}`,
          slug: `gk-${sfx}`,
          createdBy: ids.editorId,
          isListedInDirectory: true,
        })
        .returning();
      await m.db.insert(m.schema.communityMemberships).values([
        { communityId: c!.id, userId: ids.editorId, role: "owner" as const },
        { communityId: c!.id, userId: ids.uploaderId, role: "member" as const },
        { communityId: c!.id, userId: ids.memberId, role: "member" as const },
      ]);
      fx = { sfx, ...ids, community: c!, communityId: c!.id, eventIds: [] };
    }, 60_000);

    afterEach(async () => {
      vi.unstubAllEnvs();
      const { db, payload, schema, eq, inArray } = m;
      const { docs } = await payload.find({
        collection: "magazines",
        where: { communityId: { equals: fx.communityId } },
        depth: 0,
        pagination: false,
      });
      const magazineIds = docs.map((doc) => doc.id);
      if (magazineIds.length) {
        await payload.delete({
          collection: "magazine-issues",
          where: { magazine: { in: magazineIds } },
        });
        await payload.delete({
          collection: "magazines",
          where: { id: { in: magazineIds } },
        });
      }
      await payload.delete({
        collection: "gallery-items",
        where: { communityId: { equals: fx.communityId } },
      });
      await payload.delete({
        collection: "gallery-batches",
        where: { communityId: { equals: fx.communityId } },
      });
      if (fx.eventIds.length)
        await payload.delete({
          collection: "events",
          where: { id: { in: fx.eventIds } },
        });
      await db
        .delete(schema.spaces)
        .where(eq(schema.spaces.communityId, fx.communityId));
      await db
        .delete(schema.communityMemberships)
        .where(eq(schema.communityMemberships.communityId, fx.communityId));
      await db
        .delete(schema.communities)
        .where(eq(schema.communities.id, fx.communityId));
      const people = [fx.editorId, fx.uploaderId, fx.memberId, fx.outsiderId];
      await db
        .delete(schema.pointsEvents)
        .where(inArray(schema.pointsEvents.userId, people));
      await db
        .delete(schema.activityEvents)
        .where(inArray(schema.activityEvents.actorId, people));
      await db
        .delete(schema.notifications)
        .where(inArray(schema.notifications.userId, people));
      await db
        .delete(schema.memberBadges)
        .where(inArray(schema.memberBadges.userId, people));
      await db.delete(schema.user).where(inArray(schema.user.id, people));
    }, 60_000);

    async function fixture() {
      const community = fx.community;
      const c = { id: community.id, slug: community.slug };
      const magazine = await m.magazines.saveMagazineSettings(
        m,
        community,
        {
          name: `Gallery ${fx.sfx}`,
          slug: `gk-${fx.sfx}`,
          topics: [],
          defaultVisibility: "public",
          confirmUnlistedPublic: true,
        },
        fx.editorId,
        true,
      );
      const actor = { userId: fx.editorId, community };
      const issue = await m.issues.createIssue(
        m,
        magazine,
        { title: "Our month in pictures" },
        actor,
      );
      const event = await m.payload.create({
        collection: "events",
        data: {
          title: `Model night ${fx.sfx}`,
          slug: `gk-event-${fx.sfx}`,
          description: {
            root: {
              type: "root",
              version: 1,
              direction: "ltr",
              format: "",
              indent: 0,
              children: [],
            },
          },
          type: "meetup",
          status: "published",
          date: "2026-10-18T00:00:00Z",
          communityId: fx.communityId,
          location: "Test Lab",
        },
        context: { skipGeocode: true },
      });
      fx.eventIds.push(event.id);
      const batch = await m.payload.create({
        collection: "gallery-batches",
        data: {
          communityId: fx.communityId,
          uploaderId: fx.uploaderId,
          visibility: "community",
          magazineConsent: true,
          plannedFiles: 10,
          plannedVideos: 0,
          status: "finished",
        },
      });
      let n = 0;
      async function galleryItem(
        over: {
          visibility?: "community" | "public";
          magazineConsent?: boolean;
          hiddenAt?: string | null;
          status?: "ready" | "uploading";
          uploaderId?: string;
          caption?: string | null;
          eventId?: number | null;
        } = {},
      ) {
        n += 1;
        const visibility = over.visibility ?? "community";
        const uploadId = `gk-${fx.sfx}-${n}`;
        const prefix =
          visibility === "public"
            ? `media/gallery/public/${fx.communityId}`
            : `private/gallery/${fx.communityId}`;
        const doc = await m.payload.create({
          collection: "gallery-items",
          data: {
            communityId: fx.communityId,
            event: over.eventId === undefined ? event.id : over.eventId,
            mediaType: "photo",
            status: over.status ?? "ready",
            storage: visibility === "public" ? "public" : "private",
            visibility,
            fileKey: `${prefix}/${uploadId}.jpg`,
            thumbnailKey: `${prefix}/${uploadId}-thumb.jpg`,
            width: 800,
            height: 600,
            bytes: 100_000,
            uploaderId: over.uploaderId ?? fx.uploaderId,
            batch: batch.id,
            uploadId,
            caption: over.caption ?? null,
            magazineConsent: over.magazineConsent ?? true,
            hiddenAt: over.hiddenAt ?? null,
          },
        });
        return doc.id;
      }
      return { c, magazine, actor, issue, event, galleryItem };
    }

    it("offers and accepts the same items, as Postgres runs the rule", async () => {
      const { c, magazine, issue, event, galleryItem } = await fixture();
      const members = await galleryItem({ caption: "The keynote" });
      const open = await galleryItem({ visibility: "public", eventId: null });
      await galleryItem({ magazineConsent: false });
      await galleryItem({ hiddenAt: new Date().toISOString() });
      await galleryItem({ status: "uploading" });
      await galleryItem({ uploaderId: DELETED_AUTHOR_ID });

      const picked = await m.pickers.searchPickerCandidates("galleryItem", "", {
        deps: m,
        magazineId: magazine.id,
        community: c,
        viewerId: fx.editorId,
        locale: "en",
      });
      expect(picked.map((x) => x.input.galleryItemId)).toEqual([open, members]);
      expect(picked[1]).toMatchObject({
        title: "The keynote",
        facts: expect.arrayContaining([{ type: "event", title: event.title }]),
        openHref: `/communities/${c.slug}/gallery?item=${members}`,
        thumbnailUrl: expect.stringMatching(/^https:\/\/signed\.test\//),
      });

      const byEvent = await m.pickers.searchPickerCandidates(
        "galleryItem",
        `night ${fx.sfx}`,
        {
          deps: m,
          magazineId: magazine.id,
          community: c,
          viewerId: fx.editorId,
          locale: "en",
        },
      );
      expect(byEvent.map((x) => x.input.galleryItemId)).toEqual([members]);

      const ctx = m.context.itemContextFor(m, {
        magazineId: magazine.id,
        community: c,
        issueId: issue.id,
        locale: "en",
        access: "editor",
        viewerId: fx.editorId,
      });
      const { docs } = await m.payload.find({
        collection: "gallery-items",
        where: { communityId: { equals: fx.communityId } },
        depth: 0,
        pagination: false,
        sort: "id",
      });
      const blocks = docs.map((doc) => ({
        blockType: "galleryItem" as const,
        galleryItemId: doc.id,
      }));
      const refused = new Set(
        (await m.registry.validateIssueItems(blocks, ctx)).map(
          (problem) => docs[problem.itemIndex]!.id,
        ),
      );
      expect(
        docs.map((doc) => doc.id).filter((id) => !refused.has(id)),
      ).toEqual([members, open]);
    });

    it("stores only the item id and shows each reader what the gallery lets them see", async () => {
      const { c, magazine, actor, issue, galleryItem } = await fixture();
      const members = await galleryItem();
      const open = await galleryItem({ visibility: "public" });

      const saved = (
        await m.issues.setIssueItems(
          m,
          issue,
          [
            { kind: "galleryItem", galleryItemId: members, intro: "Our pick" },
            { kind: "galleryItem", galleryItemId: open },
          ],
          issue.updatedAt,
          actor,
        )
      ).issue;
      const { rows } = await m.db.execute<Record<string, unknown>>(
        m.sql`SELECT * FROM "magazine_issues_blocks_gallery_item"
          WHERE "_parent_id" = ${saved.id} ORDER BY "_order"`,
      );
      expect(rows.map((row) => Object.keys(row).sort())).toEqual(
        rows.map(() => [
          "_order",
          "_parent_id",
          "_path",
          "block_name",
          "gallery_item_id",
          "id",
          "image",
          "intro",
        ]),
      );
      expect(rows.map((row) => Number(row.gallery_item_id))).toEqual([
        members,
        open,
      ]);
      expect(JSON.stringify(rows)).not.toMatch(/https?:/);

      const load = (access: IssueReaderAccess, viewerId: string | null) =>
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
      const shownIds = async (access: IssueReaderAccess, who: string | null) =>
        (await load(access, who)).map((view) =>
          "galleryItemId" in view ? view.galleryItemId : view,
        );

      expect(await shownIds("full", null)).toEqual([open]);
      expect(await shownIds("full", fx.outsiderId)).toEqual([open]);
      expect(await shownIds("full", fx.memberId)).toEqual([members, open]);
      expect(await load("editor", fx.editorId)).toMatchObject([
        { galleryItemId: members, membersOnly: true, intro: "Our pick" },
        { galleryItemId: open, membersOnly: false },
      ]);

      await m.payload.update({
        collection: "gallery-items",
        id: members,
        data: { magazineConsent: false },
      });
      await m.payload.update({
        collection: "gallery-items",
        id: open,
        data: { hiddenAt: new Date().toISOString() },
      });
      expect(await load("full", fx.memberId)).toEqual([]);
      expect(await load("editor", fx.editorId)).toMatchObject([
        { unavailable: true, reason: "withdrawn" },
        { unavailable: true, reason: "withdrawn" },
      ]);
    });
  },
);
