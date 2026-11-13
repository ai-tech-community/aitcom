// @vitest-environment node
/**
 * DB-INTEGRATION test for reading and deleting gallery items against a REAL
 * local DB + Payload: the readable rule (`galleryReadableWhere`) and the
 * wall's facets (`findDistinct`) as Postgres runs them, with a fake object
 * storage that records which links were made.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/gallery/items.integration.test.ts
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

import type { eq as Eq, inArray as InArray } from "drizzle-orm";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type { getPayloadClient as GetPayloadClient } from "@/server/payload";
import type { plainTextToLexical as PlainTextToLexical } from "@/server/challenge-engine/lexical";

import type * as Access from "./access";
import type * as Items from "./items";

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

describe.skipIf(!RUN_DB)("gallery items [DB integration]", () => {
  type Mods = {
    db: typeof Db;
    schema: typeof Schema;
    getPayloadClient: typeof GetPayloadClient;
    access: typeof Access;
    items: typeof Items;
    eq: typeof Eq;
    inArray: typeof InArray;
    plainTextToLexical: typeof PlainTextToLexical;
  };
  let m: Mods;
  let fx: {
    uploaderId: string;
    memberId: string;
    outsiderId: string;
    communityId: string;
    slug: string;
    eventIds: number[];
  };

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [
      { db },
      schema,
      { getPayloadClient },
      access,
      items,
      drizzle,
      lexical,
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/payload"),
      import("./access"),
      import("./items"),
      import("drizzle-orm"),
      import("@/server/challenge-engine/lexical"),
    ]);
    m = {
      db,
      schema,
      getPayloadClient,
      access,
      items,
      eq: drizzle.eq,
      inArray: drizzle.inArray,
      plainTextToLexical: lexical.plainTextToLexical,
    };
  });

  beforeEach(async () => {
    vi.stubEnv("COMMUNITY_PAYMENTS_ENABLED", "false");
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const uploaderId = `it-gal-up-${suffix}`;
    const memberId = `it-gal-mem-${suffix}`;
    const outsiderId = `it-gal-out-${suffix}`;
    const slug = `gal-items-${suffix}`;
    await m.db.insert(m.schema.user).values(
      [uploaderId, memberId, outsiderId].map((id) => ({
        id,
        email: `${id}@example.test`,
        name: id,
      })),
    );
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({
        name: `Gallery items ${suffix}`,
        slug,
        createdBy: uploaderId,
        isListedInDirectory: true,
      })
      .returning({ id: m.schema.communities.id });
    await m.db.insert(m.schema.communityMemberships).values(
      [uploaderId, memberId].map((userId) => ({
        communityId: community!.id,
        userId,
        role: "member" as const,
      })),
    );
    fx = {
      uploaderId,
      memberId,
      outsiderId,
      communityId: community!.id,
      slug,
      eventIds: [],
    };
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const payload = await m.getPayloadClient();
    await payload.delete({
      collection: "gallery-items",
      where: { communityId: { equals: fx.communityId } },
    });
    await payload.delete({
      collection: "gallery-batches",
      where: { communityId: { equals: fx.communityId } },
    });
    if (fx.eventIds.length > 0) {
      await payload.delete({
        collection: "events",
        where: { id: { in: fx.eventIds } },
      });
    }
    await m.db
      .delete(m.schema.communityMemberships)
      .where(m.eq(m.schema.communityMemberships.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communities)
      .where(m.eq(m.schema.communities.id, fx.communityId));
    await m.db
      .delete(m.schema.user)
      .where(
        m.inArray(m.schema.user.id, [
          fx.uploaderId,
          fx.memberId,
          fx.outsiderId,
        ]),
      );
  });

  async function setup() {
    const payload = await m.getPayloadClient();
    const storage = {
      presignUpload: vi.fn(),
      inspect: vi.fn(),
      signedGetUrl: vi.fn(async (key: string) => `https://signed.test/${key}`),
      publicUrl: vi.fn((key: string) => `https://public.test/${key}`),
      list: vi.fn(),
      remove: vi.fn(async () => undefined),
    };
    const deps = { payload, db: m.db, storage: () => storage as never };
    const batch = await payload.create({
      collection: "gallery-batches",
      data: {
        communityId: fx.communityId,
        uploaderId: fx.uploaderId,
        visibility: "community",
        magazineConsent: false,
        plannedFiles: 5,
        plannedVideos: 0,
        status: "finished",
      },
    });
    let n = 0;
    async function pastEvent(title: string) {
      const event = await payload.create({
        collection: "events",
        data: {
          title,
          slug: `${fx.slug}-${fx.eventIds.length + 1}`,
          description: m.plainTextToLexical("Meet together"),
          type: "meetup",
          status: "published",
          date: "2026-10-18T00:00:00Z",
          communityId: fx.communityId,
          location: "Test Lab",
        },
        context: { skipGeocode: true },
      });
      fx.eventIds.push(event.id);
      return event.id;
    }
    async function readyItem(over: {
      visibility: "community" | "public";
      eventId?: number;
      topicSlug?: string | null;
      hiddenAt?: string | null;
      status?: "ready" | "uploading";
    }) {
      n += 1;
      const uploadId = `it-${fx.slug}-${n}`;
      const prefix =
        over.visibility === "public"
          ? `media/gallery/public/${fx.communityId}`
          : `private/gallery/${fx.communityId}`;
      const doc = await payload.create({
        collection: "gallery-items",
        data: {
          communityId: fx.communityId,
          event: over.eventId ?? null,
          topicSlug: over.topicSlug ?? null,
          mediaType: "photo",
          status: over.status ?? "ready",
          storage: over.visibility === "public" ? "public" : "private",
          visibility: over.visibility,
          fileKey: `${prefix}/${uploadId}.jpg`,
          thumbnailKey: `${prefix}/${uploadId}-thumb.jpg`,
          width: 800,
          height: 600,
          bytes: 100_000,
          uploaderId: fx.uploaderId,
          batch: batch.id,
          uploadId,
          hiddenAt: over.hiddenAt ?? null,
        },
      });
      return doc.id;
    }
    const viewer = (userId: string | null) =>
      m.access.loadGalleryViewer(deps, { slug: fx.slug, userId });
    return { payload, storage, deps, readyItem, pastEvent, viewer };
  }

  it("shows outsiders only public, unhidden items, without signing any link", async () => {
    const { deps, storage, readyItem, viewer } = await setup();
    const members = await readyItem({ visibility: "community" });
    const open = await readyItem({ visibility: "public", topicSlug: "talks" });
    await readyItem({
      visibility: "public",
      hiddenAt: new Date().toISOString(),
    });
    await readyItem({ visibility: "public", status: "uploading" });

    for (const userId of [fx.outsiderId, null]) {
      const outsider = await viewer(userId);
      const page = await m.items.listItems(deps, { viewer: outsider });
      expect(page.items.map((i) => i.id)).toEqual([open]);
      await expect(
        m.items.getItem(deps, { viewer: outsider, itemId: members }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        m.items.listFacets(deps, { viewer: outsider }),
      ).resolves.toEqual({ events: [], topics: ["talks"], hasUnlinked: true });
    }
    expect(storage.signedGetUrl).not.toHaveBeenCalled();
  });

  it("shows members everything not hidden, the uploader their hidden item too", async () => {
    const { deps, readyItem, viewer } = await setup();
    const members = await readyItem({
      visibility: "community",
      topicSlug: "demos",
    });
    const open = await readyItem({ visibility: "public" });
    const hidden = await readyItem({
      visibility: "community",
      hiddenAt: new Date().toISOString(),
    });

    const forMember = await m.items.listItems(deps, {
      viewer: await viewer(fx.memberId),
    });
    expect(forMember.items.map((i) => i.id)).toEqual([open, members]);
    expect(forMember.items[1]!.url).toMatch(/^https:\/\/signed\.test\//);

    const forUploader = await m.items.listItems(deps, {
      viewer: await viewer(fx.uploaderId),
    });
    expect(forUploader.items.map((i) => i.id)).toEqual([hidden, open, members]);
    expect(forUploader.items[0]!.uploader.name).toBe(fx.uploaderId);

    await expect(
      m.items.listFacets(deps, { viewer: await viewer(fx.memberId) }),
    ).resolves.toEqual({ events: [], topics: ["demos"], hasUnlinked: true });
  });

  it("shows outsiders nothing of a members-only community", async () => {
    const { deps, readyItem, viewer } = await setup();
    await m.db
      .update(m.schema.communities)
      .set({ isListedInDirectory: false })
      .where(m.eq(m.schema.communities.id, fx.communityId));
    await readyItem({ visibility: "public", topicSlug: "talks" });

    const outsider = await viewer(null);
    await expect(
      m.items.listItems(deps, { viewer: outsider }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    await expect(
      m.items.listFacets(deps, { viewer: outsider }),
    ).resolves.toEqual({ events: [], topics: [], hasUnlinked: false });
  });

  it("offers the events readable items link to, and filters by them", async () => {
    const { deps, readyItem, pastEvent, viewer } = await setup();
    const meetup = await pastEvent("Meetup");
    const workshop = await pastEvent("Workshop");
    const fromMeetup = await readyItem({
      visibility: "public",
      eventId: meetup,
    });
    // Members-only: an outsider must not be offered its event.
    await readyItem({ visibility: "community", eventId: workshop });

    await expect(
      m.items.listFacets(deps, { viewer: await viewer(null) }),
    ).resolves.toEqual({
      events: [{ id: meetup, title: "Meetup", day: "2026-10-18" }],
      topics: [],
      hasUnlinked: false,
    });
    const forMember = await m.items.listFacets(deps, {
      viewer: await viewer(fx.memberId),
    });
    expect(forMember.events.map((e) => e.id).sort()).toEqual(
      [meetup, workshop].sort(),
    );
    const page = await m.items.listItems(deps, {
      viewer: await viewer(fx.memberId),
      eventId: meetup,
    });
    expect(page.items.map((i) => i.id)).toEqual([fromMeetup]);
    expect(page.items[0]!.event).toMatchObject({ id: meetup, title: "Meetup" });
  });

  it("lets the uploader delete their hidden members-only item after leaving", async () => {
    const { deps, storage, readyItem, viewer, payload } = await setup();
    const id = await readyItem({
      visibility: "community",
      hiddenAt: new Date().toISOString(),
    });
    await m.db
      .delete(m.schema.communityMemberships)
      .where(m.eq(m.schema.communityMemberships.userId, fx.uploaderId));

    await m.items.deleteItem(deps, {
      viewer: await viewer(fx.uploaderId),
      itemId: id,
    });

    await expect(
      payload.findByID({
        collection: "gallery-items",
        id,
        depth: 0,
        disableErrors: true,
      }),
    ).resolves.toBeNull();
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });

  it("lets the uploader delete an item and removes its files", async () => {
    const { payload, deps, storage, readyItem, viewer } = await setup();
    const id = await readyItem({ visibility: "community" });

    await m.items.deleteItem(deps, {
      viewer: await viewer(fx.uploaderId),
      itemId: id,
    });

    await expect(
      payload.findByID({
        collection: "gallery-items",
        id,
        depth: 0,
        disableErrors: true,
      }),
    ).resolves.toBeNull();
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });
});
