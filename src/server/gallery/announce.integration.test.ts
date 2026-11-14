// @vitest-environment node
/**
 * DB-INTEGRATION test for announcing a finished gallery batch in the feed
 * against a REAL local DB + Payload, with a fake object storage: a member
 * uploads a photo, and the batch is closed by the member's finish and the
 * daily cleanup at once, or announced again after a lost `feedPostId`.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/gallery/announce.integration.test.ts
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

import type { and as And, eq as Eq } from "drizzle-orm";
import type { sql as Sql } from "@payloadcms/db-postgres";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type { getPayloadClient as GetPayloadClient } from "@/server/payload";

import type * as Announce from "./announce";
import type * as Cleanup from "./cleanup";
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

describe.skipIf(!RUN_DB)("gallery feed announcement [DB integration]", () => {
  type Mods = {
    db: typeof Db;
    schema: typeof Schema;
    getPayloadClient: typeof GetPayloadClient;
    announce: typeof Announce;
    cleanup: typeof Cleanup;
    uploads: typeof Uploads;
    and: typeof And;
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
      announce,
      cleanup,
      uploads,
      drizzle,
      postgres,
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/payload"),
      import("./announce"),
      import("./cleanup"),
      import("./uploads"),
      import("drizzle-orm"),
      import("@payloadcms/db-postgres"),
    ]);
    m = {
      db,
      schema,
      getPayloadClient,
      announce,
      cleanup,
      uploads,
      and: drizzle.and,
      eq: drizzle.eq,
      sql: postgres.sql,
    };
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const userId = `it-gala-${suffix}`;
    const slug = `gala-${suffix}`;
    await m.db
      .insert(m.schema.user)
      .values({ id: userId, email: `${userId}@example.test`, name: "Uma" });
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({ name: `Gallery feed ${suffix}`, slug, createdBy: userId })
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

  /** Object storage that holds whatever was granted. */
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
    return { payload, deps };
  }

  type Deps = Awaited<ReturnType<typeof setup>>["deps"];

  /** An open batch with one ready photo. */
  async function batchWithReadyPhoto(deps: Deps): Promise<number> {
    const { batchId } = await m.uploads.startBatch(deps, {
      userId: fx.userId,
      slug: fx.slug,
      visibility: "community",
      magazineConsent: false,
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
    await m.uploads.finishItem(deps, { userId: fx.userId, itemId });
    return batchId;
  }

  async function postsFor(deps: Deps, batchId: number) {
    const { docs } = await deps.payload.find({
      collection: "feed-posts",
      where: { galleryBatch: { equals: batchId } },
      depth: 0,
    });
    return docs;
  }

  async function activityFor(postId: number) {
    return m.db
      .select({ id: m.schema.activityEvents.id })
      .from(m.schema.activityEvents)
      .where(
        m.and(
          m.eq(m.schema.activityEvents.action, "feed.post_created"),
          m.eq(m.schema.activityEvents.targetId, String(postId)),
        ),
      );
  }

  it("announces a batch once when the member's finish and the daily cleanup close it together", async () => {
    const { payload, deps } = await setup();
    // A few rounds, so either side gets to win the close.
    for (let round = 0; round < 4; round++) {
      const batchId = await batchWithReadyPhoto(deps);
      // Old enough for the cleanup to close it.
      await payload.db.drizzle.execute(m.sql`
        UPDATE "gallery_batches"
          SET "created_at" = now() - interval '2 days'
          WHERE "id" = ${batchId}
      `);

      // Called only if the member's finish wins the close.
      const finishAnnounce = vi.fn(
        m.announce.galleryAnnouncer({ payload, db: m.db }),
      );
      const [finished] = await Promise.all([
        m.uploads.finishBatch(
          deps,
          { userId: fx.userId, batchId },
          finishAnnounce,
        ),
        m.cleanup.cleanupAbandonedGalleryUploads({
          payload,
          db: m.db,
          storage: deps.storage,
        }),
      ]);

      const posts = await postsFor(deps, batchId);
      expect(posts).toHaveLength(1);
      const post = posts[0]!;
      expect(post).toMatchObject({
        content: "Our first meetup",
        authorId: fx.userId,
        authorName: "Uma",
        communityId: fx.communityId,
        topicSlug: "general",
        visibility: "community",
        galleryBatch: batchId,
      });
      const batch = await payload.findByID({
        collection: "gallery-batches",
        id: batchId,
        depth: 0,
      });
      expect(batch).toMatchObject({ status: "finished", feedPostId: post.id });
      if (finishAnnounce.mock.calls.length > 0) {
        // The member's finish won: it answers with the post it made.
        expect(finished.feedPostId).toBe(post.id);
      } else {
        // The cleanup won: the finish answers with what was stored when it
        // read the batch, the post or (stored later) nothing yet.
        expect([post.id, null]).toContain(finished.feedPostId);
      }
      // Once both have settled, the member's finish answers with the post.
      await expect(
        m.uploads.finishBatch(deps, { userId: fx.userId, batchId }),
      ).resolves.toEqual({ readyCount: 1, feedPostId: post.id });
      await expect(activityFor(post.id)).resolves.toHaveLength(1);
    }
  });

  it("gives a retried announcement the post the first one made, and logs it once", async () => {
    const { payload, deps } = await setup();
    const batchId = await batchWithReadyPhoto(deps);
    // As if storing the post on the batch failed after the announcement.
    await m.uploads.finishBatch(deps, { userId: fx.userId, batchId });
    const batch = await payload.findByID({
      collection: "gallery-batches",
      id: batchId,
      depth: 0,
    });
    const announce = m.announce.galleryAnnouncer({ payload, db: m.db });

    const first = await announce(batch, []);
    const again = await Promise.all([announce(batch, []), announce(batch, [])]);

    expect(first).not.toBeNull();
    expect(again).toEqual([first, first]);
    const posts = await postsFor(deps, batchId);
    expect(posts.map((post) => post.id)).toEqual([first]);
    await expect(activityFor(first!)).resolves.toHaveLength(1);
  });

  it("finishes the batch without a post when the uploader has left the community", async () => {
    const { payload, deps } = await setup();
    const batchId = await batchWithReadyPhoto(deps);
    // Leaving deletes the membership.
    await m.db
      .delete(m.schema.communityMemberships)
      .where(
        m.and(
          m.eq(m.schema.communityMemberships.communityId, fx.communityId),
          m.eq(m.schema.communityMemberships.userId, fx.userId),
        ),
      );

    await expect(
      m.uploads.finishBatch(
        deps,
        { userId: fx.userId, batchId },
        m.announce.galleryAnnouncer({ payload, db: m.db }),
      ),
    ).resolves.toEqual({ readyCount: 1, feedPostId: null });

    await expect(postsFor(deps, batchId)).resolves.toEqual([]);
    await expect(
      payload.findByID({
        collection: "gallery-batches",
        id: batchId,
        depth: 0,
      }),
    ).resolves.toMatchObject({ status: "finished", feedPostId: null });
  });
});
