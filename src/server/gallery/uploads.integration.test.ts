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
    vi.stubEnv("COMMUNITY_GALLERY_ENABLED", "true");
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
    await m.db
      .delete(m.schema.communityMemberships)
      .where(m.eq(m.schema.communityMemberships.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communities)
      .where(m.eq(m.schema.communities.id, fx.communityId));
    await m.db.delete(m.schema.user).where(m.eq(m.schema.user.id, fx.userId));
  });

  it("takes a member's photo from a new batch to ready, and finishes the batch", async () => {
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
          // The browser uploads exactly what was granted.
          stored.set(key, { contentType, bytes: maxBytes });
          return { url: "https://s3.test/", fields: { key } };
        },
      ),
      inspect: vi.fn(async (key: string) => stored.get(key) ?? null),
      signedGetUrl: vi.fn(),
      publicUrl: vi.fn(),
      list: vi.fn(),
      remove: vi.fn(),
    };
    const deps = {
      payload,
      db: m.db,
      storage: () => storage as never,
    };

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
});
