// @vitest-environment node
/**
 * DB-INTEGRATION test for the gallery upload lifecycle against a REAL local
 * DB + Payload, with a fake object storage that reports what the browser
 * would have uploaded: a member starts a batch, starts and finishes one
 * photo, and finishes the batch.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/gallery/uploads.integration.test.ts
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
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type { getPayloadClient as GetPayloadClient } from "@/server/payload";

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

describe.skipIf(!RUN_DB)("gallery uploads [DB integration]", () => {
  type Mods = {
    db: typeof Db;
    schema: typeof Schema;
    getPayloadClient: typeof GetPayloadClient;
    uploads: typeof Uploads;
    eq: typeof Eq;
  };
  let m: Mods;
  let fx: { userId: string; communityId: string; slug: string };

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [{ db }, schema, { getPayloadClient }, uploads, drizzle] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/payload"),
        import("./uploads"),
        import("drizzle-orm"),
      ]);
    m = { db, schema, getPayloadClient, uploads, eq: drizzle.eq };
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const userId = `it-gal-${suffix}`;
    const slug = `gal-${suffix}`;
    await m.db
      .insert(m.schema.user)
      .values({ id: userId, email: `${userId}@example.test`, name: userId });
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({ name: `Gallery ${suffix}`, slug, createdBy: userId })
      .returning({ id: m.schema.communities.id });
    await m.db.insert(m.schema.communityMemberships).values({
      communityId: community!.id,
      userId,
      role: "member",
    });
    fx = { userId, communityId: community!.id, slug };
  });

  afterEach(async () => {
    const payload = await m.getPayloadClient();
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

  /**
   * Object storage that holds whatever was granted, as if the browser had
   * uploaded exactly that, and records what is removed.
   */
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

  function openBatch(deps: Deps, plannedFiles: number) {
    return m.uploads.startBatch(deps, {
      userId: fx.userId,
      slug: fx.slug,
      visibility: "community",
      magazineConsent: false,
      plannedFiles,
      plannedVideos: 0,
    });
  }

  function startPhoto(deps: Deps, batchId: number) {
    return m.uploads.startItem(deps, {
      userId: fx.userId,
      batchId,
      mediaType: "photo",
      contentType: "image/jpeg",
      bytes: 900_000,
      thumbnailBytes: 40_000,
      width: 2048,
      height: 1365,
    });
  }

  it("takes a member's photo from a new batch to ready, and finishes the batch", async () => {
    const { payload, deps } = await setup();
    const { batchId } = await m.uploads.startBatch(deps, {
      userId: fx.userId,
      slug: fx.slug,
      visibility: "community",
      magazineConsent: true,
      caption: "Our first meetup",
      plannedFiles: 1,
      plannedVideos: 0,
    });
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
    await expect(
      m.uploads.finishItem(deps, { userId: fx.userId, itemId }),
    ).resolves.toEqual({
      id: itemId,
      status: "ready",
      mediaType: "photo",
      width: 2048,
      height: 1365,
    });
    await expect(
      m.uploads.finishBatch(deps, { userId: fx.userId, batchId }),
    ).resolves.toEqual({ readyCount: 1, feedPostId: null });

    const item = await payload.findByID({
      collection: "gallery-items",
      id: itemId,
      depth: 0,
    });
    expect(item).toMatchObject({
      communityId: fx.communityId,
      status: "ready",
      storage: "private",
      visibility: "community",
      bytes: 940_000,
      uploaderId: fx.userId,
      batch: batchId,
      magazineConsent: true,
    });
    expect(item.fileKey).toMatch(
      new RegExp(`^private/gallery/${fx.communityId}/[0-9a-f-]{36}\\.jpg$`),
    );
    const batch = await payload.findByID({
      collection: "gallery-batches",
      id: batchId,
      depth: 0,
    });
    expect(batch).toMatchObject({
      status: "finished",
      caption: "Our first meetup",
      plannedFiles: 1,
    });
    expect(batch.magazineConsentAt).toBeTruthy();
  });

  it("lets exactly one of a finish and a discard racing on an item win", async () => {
    const { payload, storage, stored, deps } = await setup();
    const rounds = 6;
    const { batchId } = await openBatch(deps, rounds);
    for (let round = 0; round < rounds; round++) {
      storage.remove.mockClear();
      const { itemId } = await startPhoto(deps, batchId);
      const [finished, discarded] = await Promise.allSettled([
        m.uploads.finishItem(deps, { userId: fx.userId, itemId }),
        m.uploads.discardItem(deps, { userId: fx.userId, itemId }),
      ]);
      expect(discarded.status).toBe("fulfilled");
      const item = await payload.findByID({
        collection: "gallery-items",
        id: itemId,
        depth: 0,
      });
      if (item.status === "ready") {
        // The finish won: the discard changed nothing and kept the files.
        expect(finished.status).toBe("fulfilled");
        expect(storage.remove).not.toHaveBeenCalled();
        expect(stored.has(item.fileKey)).toBe(true);
        expect(stored.has(item.thumbnailKey)).toBe(true);
      } else {
        // The discard won: the finish reports the failure, files are gone.
        expect(item).toMatchObject({
          status: "failed",
          failureReason: "cancelled",
        });
        expect(finished).toMatchObject({
          status: "rejected",
          reason: { message: "UPLOAD_FAILED" },
        });
        expect(storage.remove).toHaveBeenCalledTimes(1);
        expect(stored.has(item.fileKey)).toBe(false);
      }
    }
  });

  it("announces a batch once when two finishes race", async () => {
    const { payload, deps } = await setup();
    const { batchId } = await openBatch(deps, 1);
    const { itemId } = await startPhoto(deps, batchId);
    await m.uploads.finishItem(deps, { userId: fx.userId, itemId });
    const announce = vi.fn(async () => 4242);

    const results = await Promise.all([
      m.uploads.finishBatch(deps, { userId: fx.userId, batchId }, announce),
      m.uploads.finishBatch(deps, { userId: fx.userId, batchId }, announce),
    ]);

    expect(announce).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.readyCount)).toEqual([1, 1]);
    expect(results.map((r) => r.feedPostId)).toContain(4242);
    const batch = await payload.findByID({
      collection: "gallery-batches",
      id: batchId,
      depth: 0,
    });
    expect(batch).toMatchObject({ status: "finished", feedPostId: 4242 });
  });

  it("sums the community's stored gallery bytes in the database, a failed item only while its grant may live", async () => {
    const { payload, deps } = await setup();
    const { usageFor } = await import("@/server/media/media-allowance");
    const { batchId } = await openBatch(deps, 3);
    const ready = await startPhoto(deps, batchId);
    await m.uploads.finishItem(deps, {
      userId: fx.userId,
      itemId: ready.itemId,
    });
    await startPhoto(deps, batchId);
    const cancelled = await startPhoto(deps, batchId);
    await m.uploads.discardItem(deps, {
      userId: fx.userId,
      itemId: cancelled.itemId,
    });
    // A failed item from yesterday: its grant expired long ago.
    const old = await payload.create({
      collection: "gallery-items",
      data: {
        communityId: fx.communityId,
        mediaType: "photo",
        status: "failed",
        storage: "private",
        visibility: "community",
        fileKey: `private/gallery/${fx.communityId}/old-upload.jpg`,
        thumbnailKey: `private/gallery/${fx.communityId}/old-upload-thumb.jpg`,
        width: 10,
        height: 10,
        bytes: 9_999_999,
        uploaderId: fx.userId,
        batch: batchId,
        uploadId: "old-upload",
        createdAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
      },
    });
    // Guard the fixture: Payload kept the back-dated creation time.
    expect(new Date(old.createdAt).getTime()).toBeLessThan(
      Date.now() - 3600_000,
    );

    // Ready, uploading and the just-cancelled item: 940 000 bytes each.
    await expect(usageFor(payload, fx.communityId)).resolves.toEqual({
      fileBytesStored: 3 * 940_000,
    });
  });
});
