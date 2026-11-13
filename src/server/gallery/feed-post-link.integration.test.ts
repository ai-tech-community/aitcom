// @vitest-environment node
/**
 * DB-INTEGRATION test for gallery feed posts in the feed's other write paths
 * (spec 2026-11-13, Feed post (collage)), against a REAL local DB + Payload,
 * so the collection's own validation runs on every write: a caption-less
 * post whose only content is its gallery batch must survive pin, report,
 * restore, edit and topic release (Review Focus 2); deleting the post, a
 * moderator removing it, and deleting its last item must each leave the
 * post and the gallery as the spec says. Object storage is a fake.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/gallery/feed-post-link.integration.test.ts
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
import type { createCaller as CreateCaller } from "@/server/api/root";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type { getPayloadClient as GetPayloadClient } from "@/server/payload";
import type * as PostReports from "@/server/communities/post-reports";
import type * as PostTopics from "@/server/communities/post-topics";

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

describe.skipIf(!RUN_DB)(
  "gallery feed posts in feed writes [DB integration]",
  () => {
    type Mods = {
      db: typeof Db;
      schema: typeof Schema;
      createCaller: typeof CreateCaller;
      getPayloadClient: typeof GetPayloadClient;
      access: typeof Access;
      items: typeof Items;
      postReports: typeof PostReports;
      postTopics: typeof PostTopics;
      eq: typeof Eq;
      inArray: typeof InArray;
    };
    let m: Mods;
    let fx: {
      authorId: string;
      moderatorId: string;
      reporterId: string;
      communityId: string;
      slug: string;
    };
    const users = () => [fx.authorId, fx.moderatorId, fx.reporterId];

    beforeAll(async () => {
      if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
        throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
      }
      const [
        { db },
        schema,
        { createCaller },
        { getPayloadClient },
        access,
        items,
        postReports,
        postTopics,
        drizzle,
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/payload"),
        import("./access"),
        import("./items"),
        import("@/server/communities/post-reports"),
        import("@/server/communities/post-topics"),
        import("drizzle-orm"),
      ]);
      m = {
        db,
        schema,
        createCaller,
        getPayloadClient,
        access,
        items,
        postReports,
        postTopics,
        eq: drizzle.eq,
        inArray: drizzle.inArray,
      };
    });

    beforeEach(async () => {
      vi.stubEnv("COMMUNITY_PAYMENTS_ENABLED", "false");
      const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
      fx = {
        authorId: `it-gfp-author-${suffix}`,
        moderatorId: `it-gfp-mod-${suffix}`,
        reporterId: `it-gfp-rep-${suffix}`,
        communityId: "",
        slug: `gfp-${suffix}`,
      };
      await m.db
        .insert(m.schema.user)
        .values(
          users().map((id) => ({ id, email: `${id}@example.test`, name: id })),
        );
      const [community] = await m.db
        .insert(m.schema.communities)
        .values({
          name: `Gallery posts ${suffix}`,
          slug: fx.slug,
          createdBy: fx.moderatorId,
        })
        .returning({ id: m.schema.communities.id });
      fx.communityId = community!.id;
      await m.db.insert(m.schema.communityMemberships).values([
        { communityId: fx.communityId, userId: fx.moderatorId, role: "owner" },
        { communityId: fx.communityId, userId: fx.authorId, role: "member" },
        { communityId: fx.communityId, userId: fx.reporterId, role: "member" },
      ]);
    });

    afterEach(async () => {
      vi.unstubAllEnvs();
      const payload = await m.getPayloadClient();
      const { docs: posts } = await payload.find({
        collection: "feed-posts",
        where: { communityId: { equals: fx.communityId } },
        pagination: false,
        depth: 0,
      });
      const postIds = posts.map((post) => post.id);
      if (postIds.length > 0) {
        await payload.delete({
          collection: "post-reports",
          where: { post: { in: postIds } },
        });
      }
      await payload.delete({
        collection: "feed-posts",
        where: { communityId: { equals: fx.communityId } },
      });
      await payload.delete({
        collection: "gallery-items",
        where: { communityId: { equals: fx.communityId } },
      });
      await payload.delete({
        collection: "gallery-batches",
        where: { communityId: { equals: fx.communityId } },
      });
      await m.db
        .delete(m.schema.notifications)
        .where(m.inArray(m.schema.notifications.userId, users()));
      await m.db
        .delete(m.schema.communityMemberships)
        .where(m.eq(m.schema.communityMemberships.communityId, fx.communityId));
      await m.db
        .delete(m.schema.communities)
        .where(m.eq(m.schema.communities.id, fx.communityId));
      await m.db
        .delete(m.schema.user)
        .where(m.inArray(m.schema.user.id, users()));
    });

    function as(userId: string) {
      return m.createCaller({
        db: m.db,
        session: { user: { id: userId, name: userId } } as never,
        headers: new Headers(),
      });
    }

    function fakeStorage() {
      return {
        presignUpload: vi.fn(),
        inspect: vi.fn(),
        signedGetUrl: vi.fn(
          async (key: string) => `https://signed.test/${key}`,
        ),
        publicUrl: vi.fn((key: string) => `https://public.test/${key}`),
        list: vi.fn(),
        remove: vi.fn(async () => undefined),
      };
    }

    /**
     * A finished batch of the author's with `ready` ready photos, announced by
     * a post with the given words (none by default).
     */
    async function galleryPost(input: { ready: number; content?: string }) {
      const payload = await m.getPayloadClient();
      const batch = await payload.create({
        collection: "gallery-batches",
        data: {
          communityId: fx.communityId,
          uploaderId: fx.authorId,
          visibility: "community",
          magazineConsent: false,
          plannedFiles: Math.max(1, input.ready),
          plannedVideos: 0,
          status: "finished",
        },
      });
      const itemIds: number[] = [];
      for (let n = 1; n <= input.ready; n++) {
        const uploadId = `it-${fx.slug}-${batch.id}-${n}`;
        const item = await payload.create({
          collection: "gallery-items",
          data: {
            communityId: fx.communityId,
            mediaType: "photo",
            status: "ready",
            storage: "private",
            visibility: "community",
            fileKey: `private/gallery/${fx.communityId}/${uploadId}.jpg`,
            thumbnailKey: `private/gallery/${fx.communityId}/${uploadId}-thumb.jpg`,
            width: 800,
            height: 600,
            bytes: 100_000,
            uploaderId: fx.authorId,
            batch: batch.id,
            uploadId,
          },
        });
        itemIds.push(item.id);
      }
      const post = await payload.create({
        collection: "feed-posts",
        data: {
          content: input.content ?? "",
          authorId: fx.authorId,
          authorName: "Author",
          communityId: fx.communityId,
          likeCount: 0,
          commentCount: 0,
          topicSlug: "outings",
          visibility: "community",
          galleryBatch: batch.id,
        },
      });
      await payload.update({
        collection: "gallery-batches",
        id: batch.id,
        data: { feedPostId: post.id },
      });
      return { batchId: batch.id, postId: post.id, itemIds };
    }

    async function saved(postId: number) {
      const payload = await m.getPayloadClient();
      return payload.findByID({
        collection: "feed-posts",
        id: postId,
        depth: 0,
      });
    }

    async function itemsOf(batchId: number) {
      const payload = await m.getPayloadClient();
      const { docs } = await payload.find({
        collection: "gallery-items",
        where: { batch: { equals: batchId } },
        pagination: false,
        depth: 0,
      });
      return docs.map((doc) => doc.id);
    }

    it("Review Focus 2: pin, report, restore, edit and topic release all save a caption-less gallery post", async () => {
      const { postId, batchId } = await galleryPost({ ready: 2 });

      await as(fx.moderatorId).feed.pinPost({ postId, isPinned: true });
      expect(await saved(postId)).toMatchObject({
        isPinned: true,
        content: "",
      });

      await as(fx.reporterId).feed.reportPost({ postId, reason: "spam" });
      expect((await saved(postId)).hiddenAt).toBeTruthy();

      await as(fx.moderatorId).feed.reviewReport({ postId, action: "restore" });
      expect(await saved(postId)).toMatchObject({
        hiddenAt: null,
        reportCount: 0,
      });

      await as(fx.authorId).feed.editPost({
        postId,
        communitySlug: fx.slug,
        content: "Our picnic",
      });
      await as(fx.authorId).feed.editPost({
        postId,
        communitySlug: fx.slug,
        content: "",
      });
      expect(await saved(postId)).toMatchObject({
        content: "",
        isEdited: true,
        galleryBatch: batchId,
      });

      const payload = await m.getPayloadClient();
      await m.postTopics.releaseDeletedTopic(payload, {
        communityId: fx.communityId,
        slug: "outings",
      });
      expect(await saved(postId)).toMatchObject({
        topicSlug: "general",
        galleryBatch: batchId,
        isDeleted: false,
      });
    });

    it("refuses to change a gallery post's media, and keeps it as it was", async () => {
      const { postId, batchId } = await galleryPost({ ready: 1 });
      await expect(
        as(fx.authorId).feed.editPost({
          postId,
          communitySlug: fx.slug,
          content: "",
          media: { kind: "none" },
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await saved(postId)).toMatchObject({
        galleryBatch: batchId,
        isEdited: false,
      });
    });

    it("deleting the post lets go of the batch and leaves its items in the gallery", async () => {
      const { postId, batchId, itemIds } = await galleryPost({ ready: 2 });

      await as(fx.authorId).feed.deletePost({ postId });

      expect(await saved(postId)).toMatchObject({
        isDeleted: true,
        galleryBatch: null,
      });
      expect((await itemsOf(batchId)).sort()).toEqual([...itemIds].sort());
    });

    it("a moderator removing a reported gallery post removes its items and their files", async () => {
      const { postId, batchId, itemIds } = await galleryPost({ ready: 2 });
      await as(fx.reporterId).feed.reportPost({ postId, reason: "spam" });
      const payload = await m.getPayloadClient();
      const gallery = fakeStorage();
      const video = vi.fn(() => {
        throw new Error("video storage must not be reached");
      });

      await m.postReports.reviewReport(
        {
          payload,
          storage: video,
          galleryStorage: () => gallery as never,
          notifyModerators: async () => undefined,
        },
        { postId, action: "remove" },
      );

      expect(await saved(postId)).toMatchObject({
        isDeleted: true,
        content: "",
        galleryBatch: null,
      });
      expect(await itemsOf(batchId)).toEqual([]);
      expect(gallery.remove).toHaveBeenCalledTimes(itemIds.length);
      const { totalDocs } = await payload.count({
        collection: "post-reports",
        where: { post: { equals: postId } },
      });
      expect(totalDocs).toBe(0);
      expect(video).not.toHaveBeenCalled();
    });

    it("deleting the last ready item removes a caption-less post, but not one with words", async () => {
      const payload = await m.getPayloadClient();
      const deps = { payload, db: m.db, storage: () => fakeStorage() as never };
      const viewer = await m.access.loadGalleryViewer(deps, {
        slug: fx.slug,
        userId: fx.authorId,
      });
      const bare = await galleryPost({ ready: 2 });
      const worded = await galleryPost({ ready: 1, content: "Our picnic" });

      await m.items.deleteItem(deps, { viewer, itemId: bare.itemIds[0]! });
      expect(await saved(bare.postId)).toMatchObject({
        isDeleted: false,
        galleryBatch: bare.batchId,
      });

      await m.items.deleteItem(deps, { viewer, itemId: bare.itemIds[1]! });
      expect(await saved(bare.postId)).toMatchObject({
        isDeleted: true,
        content: "",
        galleryBatch: null,
      });

      await m.items.deleteItem(deps, { viewer, itemId: worded.itemIds[0]! });
      expect(await saved(worded.postId)).toMatchObject({
        isDeleted: false,
        content: "Our picnic",
        galleryBatch: worded.batchId,
      });
    });
  },
);
