import { describe, expect, it, vi } from "vitest";

import {
  sweepUnusedVideoFiles,
  UNUSED_VIDEO_MIN_AGE_HOURS,
} from "./unused-video-files-sweep";

const NOW = new Date("2026-10-01T03:00:00.000Z");
const OLD = new Date(
  NOW.getTime() - (UNUSED_VIDEO_MIN_AGE_HOURS + 1) * 60 * 60 * 1000,
);
const YOUNG = new Date(NOW.getTime() - 60 * 60 * 1000);
const GRANT = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";

function fakes(over: {
  posts?: unknown[];
  grants?: unknown[];
  objects?: Record<string, { key: string; lastModified: Date }[]>;
  findError?: Error;
}) {
  const payload = {
    find: vi
      .fn()
      .mockImplementation(({ collection }: { collection: string }) => {
        if (over.findError) return Promise.reject(over.findError);
        return Promise.resolve({
          docs:
            collection === "feed-posts"
              ? (over.posts ?? [])
              : (over.grants ?? []),
        });
      }),
  };
  const storage = {
    list: vi.fn(async function* (prefix: string) {
      for (const object of over.objects?.[prefix] ?? []) yield object;
    }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const log = vi.fn();
  return {
    payload,
    storage,
    log,
    deps: {
      payload: payload as never,
      storage: () => storage,
      now: () => NOW,
      log,
    },
  };
}

describe("sweepUnusedVideoFiles", () => {
  it("removes old files nothing points at and keeps everything in use", async () => {
    const { deps, storage } = fakes({
      posts: [
        {
          video: {
            key: "media/videos/public/c1/live.mp4",
            thumbnailKey: "media/videos/public/c1/live.jpg",
          },
        },
      ],
      grants: [{ visibility: "community", communityId: "c1", uploadId: GRANT }],
      objects: {
        "media/videos/public/": [
          { key: "media/videos/public/c1/live.mp4", lastModified: OLD },
          { key: "media/videos/public/c1/live.jpg", lastModified: OLD },
          { key: "media/videos/public/c1/lost.mp4", lastModified: OLD },
          { key: "media/videos/public/c1/new.mp4", lastModified: YOUNG },
        ],
        "private/videos/": [
          { key: `private/videos/c1/${GRANT}.mp4`, lastModified: OLD },
          { key: "private/videos/c1/lost.jpg", lastModified: OLD },
        ],
      },
    });
    await expect(sweepUnusedVideoFiles(deps)).resolves.toEqual({
      scanned: 6,
      removed: 2,
      failed: 0,
    });
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith([
      "media/videos/public/c1/lost.mp4",
      "private/videos/c1/lost.jpg",
    ]);
  });

  it("counts only live posts as using a file", async () => {
    const { deps, payload } = fakes({});
    await sweepUnusedVideoFiles(deps);
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "feed-posts",
        where: {
          and: [
            { "video.key": { exists: true } },
            {
              or: [
                { isDeleted: { equals: false } },
                { isDeleted: { exists: false } },
              ],
            },
          ],
        },
        pagination: false,
      }),
    );
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "video-uploads",
        where: { finishedAt: { exists: false } },
        pagination: false,
      }),
    );
  });

  it("removes in batches S3 accepts", async () => {
    const lost = Array.from({ length: 1001 }, (_, i) => ({
      key: `private/videos/c1/lost-${i}.mp4`,
      lastModified: OLD,
    }));
    const { deps, storage } = fakes({ objects: { "private/videos/": lost } });
    await expect(sweepUnusedVideoFiles(deps)).resolves.toMatchObject({
      removed: 1001,
    });
    expect(
      (storage.remove.mock.calls as [string[]][]).map(([keys]) => keys.length),
    ).toEqual([1000, 1]);
  });

  it("logs a failed removal and keeps going", async () => {
    const lost = Array.from({ length: 1001 }, (_, i) => ({
      key: `private/videos/c1/lost-${i}.mp4`,
      lastModified: OLD,
    }));
    const { deps, storage, log } = fakes({
      objects: { "private/videos/": lost },
    });
    const failure = new Error("AccessDenied");
    storage.remove.mockRejectedValueOnce(failure);
    await expect(sweepUnusedVideoFiles(deps)).resolves.toMatchObject({
      removed: 1,
      failed: 1000,
    });
    expect(log).toHaveBeenCalledWith("[unused-video-files] removal failed", {
      keys: expect.any(Array),
      error: failure,
    });
  });

  it("deletes nothing when it cannot read which files are in use", async () => {
    const { deps, storage } = fakes({ findError: new Error("db down") });
    await expect(sweepUnusedVideoFiles(deps)).rejects.toThrow("db down");
    expect(storage.list).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
