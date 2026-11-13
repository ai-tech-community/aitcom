// @vitest-environment node
/**
 * DB-INTEGRATION test for the gallery cleanup and the unused-files sweep
 * against a REAL local DB + Payload, with a fake object storage: uploads are
 * started through the service, then aged past ABANDONED_UPLOAD_HOURS in SQL.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/gallery/cleanup.integration.test.ts
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

import type { eq as Eq } from "drizzle-orm";
import type { sql as Sql } from "@payloadcms/db-postgres";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type { getPayloadClient as GetPayloadClient } from "@/server/payload";

import type * as Cleanup from "./cleanup";
import type * as Sweep from "./unused-files-sweep";
import type * as Uploads from "./uploads";

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

describe.skipIf(!RUN_DB)("gallery cleanup [DB integration]", () => {
  type Mods = {
    db: typeof Db;
    schema: typeof Schema;
    getPayloadClient: typeof GetPayloadClient;
    uploads: typeof Uploads;
    cleanup: typeof Cleanup;
    sweep: typeof Sweep;
    eq: typeof Eq;
    sql: typeof Sql;
  };
  let m: Mods;
  let fx: { userId: string; communityId: string; slug: string };

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [
      { db },
      schema,
      { getPayloadClient },
      uploads,
      cleanup,
      sweep,
      drizzle,
      postgres,
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/payload"),
      import("./uploads"),
      import("./cleanup"),
      import("./unused-files-sweep"),
      import("drizzle-orm"),
      import("@payloadcms/db-postgres"),
    ]);
    m = {
      db,
      schema,
      getPayloadClient,
      uploads,
      cleanup,
      sweep,
      eq: drizzle.eq,
      sql: postgres.sql,
    };
  });

  beforeEach(async () => {
    vi.stubEnv("COMMUNITY_GALLERY_ENABLED", "true");
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const userId = `it-galc-${suffix}`;
    const slug = `galc-${suffix}`;
    await m.db
      .insert(m.schema.user)
      .values({ id: userId, email: `${userId}@example.test`, name: userId });
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({ name: `Gallery cleanup ${suffix}`, slug, createdBy: userId })
      .returning({ id: m.schema.communities.id });
    await m.db.insert(m.schema.communityMemberships).values({
      communityId: community!.id,
      userId,
      role: "member",
    });
    fx = { userId, communityId: community!.id, slug };
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const payload = await m.getPayloadClient();
    await payload.delete({
      collection: "feed-posts",
      where: { communityId: { equals: fx.communityId } },
    });
    await m.db
      .delete(m.schema.activityEvents)
      .where(m.eq(m.schema.activityEvents.communityId, fx.communityId));
    await payload.delete({
      collection: "gallery-items",
      where: { communityId: { equals: fx.communityId } },
    });
    await payload.delete({
      collection: "gallery-batches",
      where: { communityId: { equals: fx.communityId } },
    });
    await m.db
      .delete(m.schema.communityMemberships)
      .where(m.eq(m.schema.communityMemberships.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communities)
      .where(m.eq(m.schema.communities.id, fx.communityId));
    await m.db.delete(m.schema.user).where(m.eq(m.schema.user.id, fx.userId));
  });

  /** Object storage that holds whatever was granted and records removals. */
  async function setup() {
    const payload = await m.getPayloadClient();
    const stored = new Map<string, { contentType: string; bytes: number }>();
    const storage = {
      presignUpload: vi.fn(
        async ({
          key,
          contentType,
          maxBytes,
        }: {
          key: string;
          contentType: string;
          maxBytes: number;
        }) => {
          stored.set(key, { contentType, bytes: maxBytes });
          return { url: "https://s3.test/", fields: { key } };
        },
      ),
      inspect: vi.fn(async (key: string) => stored.get(key) ?? null),
      signedGetUrl: vi.fn(),
      publicUrl: vi.fn(),
      list: vi.fn(),
      remove: vi.fn(async (keys: readonly string[]) => {
        for (const key of keys) stored.delete(key);
      }),
    };
    const deps = { payload, db: m.db, storage: () => storage as never };
    return { payload, storage, stored, deps };
  }

  type Deps = Awaited<ReturnType<typeof setup>>["deps"];

  async function startPhotos(deps: Deps, count: number) {
    const { batchId } = await m.uploads.startBatch(deps, {
      userId: fx.userId,
      slug: fx.slug,
      visibility: "community",
      magazineConsent: false,
      plannedFiles: count,
      plannedVideos: 0,
    });
    const itemIds: number[] = [];
    for (let i = 0; i < count; i++) {
      const { itemId } = await m.uploads.startItem(deps, {
        userId: fx.userId,
        batchId,
        mediaType: "photo",
        contentType: "image/jpeg",
        bytes: 900_000,
        thumbnailBytes: 40_000,
        width: 2048,
        height: 1365,
      });
      itemIds.push(itemId);
    }
    return { batchId, itemIds };
  }

  /** Moves this community's batches and items two days into the past. */
  async function ageEverything(payload: Deps["payload"]) {
    for (const table of ["gallery_batches", "gallery_items"]) {
      await payload.db.drizzle.execute(m.sql`
        UPDATE ${m.sql.identifier(table)}
          SET "created_at" = now() - interval '2 days'
          WHERE "community_id" = ${fx.communityId}
      `);
    }
  }

  it("removes an abandoned upload and closes its batch, keeping the ready item and the batch", async () => {
    const { payload, stored, deps } = await setup();
    const {
      batchId,
      itemIds: [readyId, abandonedId],
    } = await startPhotos(deps, 2);
    await m.uploads.finishItem(deps, { userId: fx.userId, itemId: readyId! });
    const abandoned = await payload.findByID({
      collection: "gallery-items",
      id: abandonedId!,
      depth: 0,
    });
    await ageEverything(payload);

    await m.cleanup.cleanupAbandonedGalleryUploads({
      payload,
      db: m.db,
      storage: deps.storage,
    });

    await expect(
      payload.findByID({
        collection: "gallery-items",
        id: abandonedId!,
        depth: 0,
        disableErrors: true,
      }),
    ).resolves.toBeNull();
    expect(stored.has(abandoned.fileKey)).toBe(false);
    expect(stored.has(abandoned.thumbnailKey)).toBe(false);
    await expect(
      payload.findByID({ collection: "gallery-items", id: readyId!, depth: 0 }),
    ).resolves.toMatchObject({ status: "ready" });
    await expect(
      payload.findByID({
        collection: "gallery-batches",
        id: batchId,
        depth: 0,
      }),
    ).resolves.toMatchObject({ status: "finished" });
  });

  it("deletes a batch whose every upload was abandoned", async () => {
    const { payload, deps } = await setup();
    const { batchId } = await startPhotos(deps, 1);
    await ageEverything(payload);

    await m.cleanup.cleanupAbandonedGalleryUploads({
      payload,
      db: m.db,
      storage: deps.storage,
    });

    await expect(
      payload.findByID({
        collection: "gallery-batches",
        id: batchId,
        depth: 0,
        disableErrors: true,
      }),
    ).resolves.toBeNull();
  });

  /** Whether the batch still exists after a cleanup run. */
  async function batchSurvivesCleanup(deps: Deps, batchId: number) {
    const { payload } = deps;
    await ageEverything(payload);
    await m.cleanup.cleanupAbandonedGalleryUploads({
      payload,
      db: m.db,
      storage: deps.storage,
    });
    const batch = await payload.findByID({
      collection: "gallery-batches",
      id: batchId,
      depth: 0,
      disableErrors: true,
    });
    return batch !== null;
  }

  it("deletes a finished batch whose only item was discarded", async () => {
    const { deps } = await setup();
    const {
      batchId,
      itemIds: [itemId],
    } = await startPhotos(deps, 1);
    await m.uploads.discardItem(deps, { userId: fx.userId, itemId: itemId! });
    await m.uploads.finishBatch(deps, { userId: fx.userId, batchId });

    await expect(batchSurvivesCleanup(deps, batchId)).resolves.toBe(false);
  });

  it("keeps a finished batch that still has an item", async () => {
    const { deps } = await setup();
    const {
      batchId,
      itemIds: [itemId],
    } = await startPhotos(deps, 1);
    await m.uploads.finishItem(deps, { userId: fx.userId, itemId: itemId! });
    await m.uploads.finishBatch(deps, { userId: fx.userId, batchId });

    await expect(batchSurvivesCleanup(deps, batchId)).resolves.toBe(true);
  });

  it("keeps an empty finished batch that announced a feed post", async () => {
    const { payload, deps } = await setup();
    const {
      batchId,
      itemIds: [itemId],
    } = await startPhotos(deps, 1);
    await m.uploads.discardItem(deps, { userId: fx.userId, itemId: itemId! });
    await m.uploads.finishBatch(deps, { userId: fx.userId, batchId });
    await payload.update({
      collection: "gallery-batches",
      id: batchId,
      data: { feedPostId: 123456 },
    });

    await expect(batchSurvivesCleanup(deps, batchId)).resolves.toBe(true);
  });

  it("keeps an empty finished batch a feed post points at, even when its feedPostId was never saved", async () => {
    const { payload, deps } = await setup();
    const {
      batchId,
      itemIds: [itemId],
    } = await startPhotos(deps, 1);
    await m.uploads.discardItem(deps, { userId: fx.userId, itemId: itemId! });
    await m.uploads.finishBatch(deps, { userId: fx.userId, batchId });
    const post = await payload.create({
      collection: "feed-posts",
      data: {
        content: "",
        authorId: fx.userId,
        authorName: fx.userId,
        communityId: fx.communityId,
        likeCount: 0,
        commentCount: 0,
        topicSlug: "general",
        visibility: "community",
        galleryBatch: batchId,
      },
    });

    await expect(batchSurvivesCleanup(deps, batchId)).resolves.toBe(true);
    await expect(
      payload.findByID({ collection: "feed-posts", id: post.id, depth: 0 }),
    ).resolves.toMatchObject({ galleryBatch: batchId });
  });

  it("announces an abandoned batch with a ready item in the feed when it closes it", async () => {
    const { payload, deps } = await setup();
    const {
      batchId,
      itemIds: [readyId],
    } = await startPhotos(deps, 1);
    await m.uploads.finishItem(deps, { userId: fx.userId, itemId: readyId! });
    await ageEverything(payload);

    await m.cleanup.cleanupAbandonedGalleryUploads({
      payload,
      db: m.db,
      storage: deps.storage,
    });

    const { docs: posts } = await payload.find({
      collection: "feed-posts",
      where: { galleryBatch: { equals: batchId } },
      depth: 0,
    });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      authorId: fx.userId,
      communityId: fx.communityId,
      visibility: "community",
      topicSlug: "general",
    });
    await expect(
      payload.findByID({
        collection: "gallery-batches",
        id: batchId,
        depth: 0,
      }),
    ).resolves.toMatchObject({ status: "finished", feedPostId: posts[0]!.id });
  });

  it("keeps a young empty finished batch", async () => {
    const { payload, deps } = await setup();
    const { batchId } = await startPhotos(deps, 1);
    await payload.delete({
      collection: "gallery-items",
      where: { batch: { equals: batchId } },
    });
    await m.uploads.finishBatch(deps, { userId: fx.userId, batchId });

    await m.cleanup.cleanupAbandonedGalleryUploads({
      payload,
      db: m.db,
      storage: deps.storage,
    });
    await expect(
      payload.findByID({
        collection: "gallery-batches",
        id: batchId,
        depth: 0,
      }),
    ).resolves.toMatchObject({ status: "finished" });
  });

  it("keeps every file an item points at, in any status, and removes only lost gallery files", async () => {
    const { payload, deps } = await setup();
    const {
      itemIds: [readyId, uploadingId],
    } = await startPhotos(deps, 2);
    await m.uploads.finishItem(deps, { userId: fx.userId, itemId: readyId! });
    const items = await Promise.all(
      [readyId!, uploadingId!].map((id) =>
        payload.findByID({ collection: "gallery-items", id, depth: 0 }),
      ),
    );
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const lost = `private/gallery/${fx.communityId}/lost-${Date.now()}.jpg`;
    const objects = [
      ...items.flatMap((item) => [item.fileKey, item.thumbnailKey]),
      lost,
      "private/videos/not-ours.mp4",
    ].map((key) => ({ key, lastModified: old }));
    const removed: string[] = [];
    const storage = {
      list: vi.fn(async function* (prefix: string) {
        if (prefix === "private/gallery/") yield* objects;
      }),
      remove: vi.fn(async (keys: readonly string[]) => {
        removed.push(...keys);
      }),
    };

    await m.sweep.sweepUnusedGalleryFiles({ payload, storage: () => storage });

    expect(removed).toEqual([lost]);
  });
});
