// @vitest-environment node
/**
 * DB-INTEGRATION test for what gallery feed posts show each viewer, against
 * a REAL local DB + Payload: the batch scan (`select`, `batch IN (...)`) and
 * the read rule as Postgres runs them, with a fake object storage that
 * records which links were made.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/gallery/feed-view.integration.test.ts
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

import type * as FeedView from "./feed-view";

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

describe.skipIf(!RUN_DB)("gallery feed post views [DB integration]", () => {
  type Mods = {
    db: typeof Db;
    schema: typeof Schema;
    getPayloadClient: typeof GetPayloadClient;
    feedView: typeof FeedView;
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
    const [{ db }, schema, { getPayloadClient }, feedView, drizzle, lexical] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/payload"),
        import("./feed-view"),
        import("drizzle-orm"),
        import("@/server/challenge-engine/lexical"),
      ]);
    m = {
      db,
      schema,
      getPayloadClient,
      feedView,
      eq: drizzle.eq,
      inArray: drizzle.inArray,
      plainTextToLexical: lexical.plainTextToLexical,
    };
  });

  beforeEach(async () => {
    vi.stubEnv("COMMUNITY_PAYMENTS_ENABLED", "false");
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const uploaderId = `it-galfv-up-${suffix}`;
    const memberId = `it-galfv-mem-${suffix}`;
    const outsiderId = `it-galfv-out-${suffix}`;
    const slug = `gal-feed-view-${suffix}`;
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
        name: `Gallery feed view ${suffix}`,
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
    const event = await payload.create({
      collection: "events",
      data: {
        title: "Meetup",
        slug: `${fx.slug}-meetup`,
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
    async function newBatch() {
      const batch = await payload.create({
        collection: "gallery-batches",
        data: {
          communityId: fx.communityId,
          uploaderId: fx.uploaderId,
          event: event.id,
          topicSlug: "meetups",
          visibility: "community",
          magazineConsent: false,
          plannedFiles: 5,
          plannedVideos: 0,
          status: "finished",
        },
      });
      return batch.id;
    }
    let n = 0;
    async function readyItem(
      batchId: number,
      over: {
        visibility: "community" | "public";
        hiddenAt?: string | null;
        status?: "ready" | "uploading";
      },
    ) {
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
          event: event.id,
          topicSlug: "meetups",
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
          batch: batchId,
          uploadId,
          hiddenAt: over.hiddenAt ?? null,
        },
      });
      return doc.id;
    }
    const post = (id: number, batchId: number) => ({
      id,
      communityId: fx.communityId,
      galleryBatch: batchId,
    });
    return { deps, storage, event, newBatch, readyItem, post };
  }

  it("shows each viewer only the batch items they may read, counted", async () => {
    const { deps, storage, event, newBatch, readyItem, post } = await setup();
    const batch = await newBatch();
    const members = await readyItem(batch, { visibility: "community" });
    const open = await readyItem(batch, { visibility: "public" });
    const hidden = await readyItem(batch, {
      visibility: "community",
      hiddenAt: new Date().toISOString(),
    });
    // Hidden, but the uploader's own: they still see it.
    const ownHiddenPublic = await readyItem(batch, {
      visibility: "public",
      hiddenAt: new Date().toISOString(),
    });
    await readyItem(batch, { visibility: "public", status: "uploading" });
    const posts = [post(1, batch), { ...post(2, batch), galleryBatch: null }];
    const view = async (userId: string | null) =>
      (await m.feedView.galleryViewsForPosts(deps, posts, userId)).get(1);

    for (const userId of [fx.outsiderId, null]) {
      const forOutsider = await view(userId);
      expect(forOutsider!.items.map((i) => i.id)).toEqual([open]);
      expect(forOutsider!.total).toBe(1);
    }
    expect(storage.signedGetUrl).not.toHaveBeenCalled();

    const forMember = await view(fx.memberId);
    expect(forMember).toMatchObject({
      batchId: batch,
      total: 2,
      event: { id: event.id, title: "Meetup", slug: `${fx.slug}-meetup` },
      topicSlug: "meetups",
    });
    expect(forMember!.items.map((i) => i.id)).toEqual([open, members]);
    expect(forMember!.items[1]!.url).toMatch(/^https:\/\/signed\.test\//);

    const forUploader = await view(fx.uploaderId);
    expect(forUploader!.items.map((i) => i.id)).toEqual([
      ownHiddenPublic,
      hidden,
      open,
    ]);
    expect(forUploader!.total).toBe(4);
    expect(forUploader!.items[0]!.isOwn).toBe(true);

    const all = await m.feedView.galleryViewsForPosts(deps, posts, fx.memberId);
    expect(all.get(2)).toBeNull();
  });

  it("shows the three newest of each batch and counts the rest", async () => {
    const { deps, newBatch, readyItem, post } = await setup();
    const big = await newBatch();
    const small = await newBatch();
    const bigIds: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      bigIds.push(await readyItem(big, { visibility: "community" }));
    }
    const only = await readyItem(small, { visibility: "community" });

    const views = await m.feedView.galleryViewsForPosts(
      deps,
      [post(1, big), post(2, small)],
      fx.memberId,
    );

    expect(views.get(1)!.items.map((i) => i.id)).toEqual(
      bigIds.slice(2).reverse(),
    );
    expect(views.get(1)!.total).toBe(5);
    expect(views.get(2)!.items.map((i) => i.id)).toEqual([only]);
    expect(views.get(2)!.total).toBe(1);
  });

  it("shows an outsider nothing of a members-only community", async () => {
    const { deps, newBatch, readyItem, post } = await setup();
    await m.db
      .update(m.schema.communities)
      .set({ isListedInDirectory: false })
      .where(m.eq(m.schema.communities.id, fx.communityId));
    const batch = await newBatch();
    await readyItem(batch, { visibility: "public" });

    for (const userId of [fx.outsiderId, null]) {
      const views = await m.feedView.galleryViewsForPosts(
        deps,
        [post(1, batch)],
        userId,
      );
      expect(views.get(1)).toBeNull();
    }
  });
});
