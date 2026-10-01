// @vitest-environment node
/**
 * DB-INTEGRATION test for the unused video files sweep. Proves, against a
 * REAL local DB + Payload, which keys count as in use: a live post's files
 * and an open upload grant's files are kept; a deleted post's files go.
 * Storage is a fake that lists those keys as old.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/communities/unused-video-files-sweep.integration.test.ts
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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

describe.skipIf(!RUN_DB)("sweepUnusedVideoFiles [DB integration]", () => {
  let getPayloadClient: typeof import("@/server/payload").getPayloadClient;
  let sweep: typeof import("./unused-video-files-sweep").sweepUnusedVideoFiles;
  const created: { posts: number[]; grants: number[] } = {
    posts: [],
    grants: [],
  };

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    ({ getPayloadClient } = await import("@/server/payload"));
    ({ sweepUnusedVideoFiles: sweep } =
      await import("./unused-video-files-sweep"));
  });

  afterEach(async () => {
    const payload = await getPayloadClient();
    for (const id of created.posts) {
      await payload.delete({ collection: "feed-posts", id }).catch(() => null);
    }
    for (const id of created.grants) {
      await payload
        .delete({ collection: "video-uploads", id })
        .catch(() => null);
    }
    created.posts = [];
    created.grants = [];
  });

  it("keeps live posts' and open grants' files, removes a deleted post's", async () => {
    const payload = await getPayloadClient();
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const community = `sweep${suffix}`;
    const videoPost = async (name: string, isDeleted: boolean) => {
      const post = await payload.create({
        collection: "feed-posts",
        data: {
          content: name,
          authorId: `it-sweep-${suffix}`,
          authorName: "Tester",
          communityId: community,
          topicSlug: "general",
          likeCount: 0,
          commentCount: 0,
          visibility: "community",
          isDeleted,
          video: {
            key: `private/videos/${community}/${name}.mp4`,
            thumbnailKey: `private/videos/${community}/${name}.jpg`,
            storage: "private",
            durationSeconds: 5,
            width: 720,
            height: 1280,
            bytes: 10,
          },
        },
      });
      created.posts.push(post.id);
    };
    await videoPost("live", false);
    await videoPost("gone", true);
    const uploadId = crypto.randomUUID();
    const grant = await payload.create({
      collection: "video-uploads",
      data: {
        uploadId,
        userId: `it-sweep-${suffix}`,
        communityId: community,
        visibility: "community",
      },
    });
    created.grants.push(grant.id);

    const old = new Date("2020-01-01T00:00:00Z");
    const keys = [
      "live.mp4",
      "live.jpg",
      "gone.mp4",
      "gone.jpg",
      `${uploadId}.mp4`,
      `${uploadId}.jpg`,
    ].map((name) => `private/videos/${community}/${name}`);
    const remove = vi.fn().mockResolvedValue(undefined);
    const result = await sweep({
      payload,
      storage: () => ({
        list: async function* (prefix: string) {
          for (const key of keys) {
            if (key.startsWith(prefix)) yield { key, lastModified: old };
          }
        },
        remove,
      }),
    });

    expect(result).toEqual({ scanned: 6, removed: 2, failed: 0 });
    expect(remove).toHaveBeenCalledWith([
      `private/videos/${community}/gone.mp4`,
      `private/videos/${community}/gone.jpg`,
    ]);
  });
});
