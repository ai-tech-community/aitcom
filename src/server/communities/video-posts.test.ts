// src/server/communities/video-posts.test.ts
import { ValidationError } from "payload";
import { describe, expect, it, vi } from "vitest";

import { FINISH_WINDOW_HOURS } from "@/lib/video-rules";

import {
  cleanUpDeletedPostVideo,
  finishVideoPost,
  issueVideoUpload,
  removePostVideo,
} from "./video-posts";

const UPLOAD = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const NOW = new Date("2026-09-24T12:00:00.000Z");

function fakes(
  over: {
    uploads?: unknown[];
    posts?: unknown[];
    recent?: number;
    heads?: unknown[];
  } = {},
) {
  const payload = {
    count: vi.fn().mockResolvedValue({ totalDocs: over.recent ?? 0 }),
    create: vi
      .fn()
      .mockImplementation(({ data }) => Promise.resolve({ id: 7, ...data })),
    find: vi.fn().mockImplementation(({ collection }: { collection: string }) =>
      Promise.resolve({
        docs:
          collection === "feed-posts"
            ? (over.posts ?? [])
            : (over.uploads ?? []),
      }),
    ),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  };
  const heads = [...(over.heads ?? [])];
  const log = vi.fn();
  const storage = {
    presignUpload: vi
      .fn()
      .mockImplementation(({ key }) =>
        Promise.resolve({ url: "u", fields: { key } }),
      ),
    inspect: vi
      .fn()
      .mockImplementation(() => Promise.resolve(heads.shift() ?? null)),
    playbackUrl: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return {
    payload,
    storage,
    log,
    deps: {
      payload: payload as never,
      storage,
      now: () => NOW,
      newUploadId: () => UPLOAD,
      log,
    },
  };
}

const upload = (over: Record<string, unknown> = {}) => ({
  id: 3,
  uploadId: UPLOAD,
  userId: "u1",
  communityId: "c1",
  visibility: "public",
  finishedAt: null,
  createdAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
  ...over,
});

const finish = {
  userId: "u1",
  authorName: "Greg",
  communityId: "c1",
  uploadId: UPLOAD,
  caption: "Demo",
  topicSlug: "general",
  durationSeconds: 42,
  width: 720,
  height: 1280,
};

const goodHeads = () => [
  { contentType: "video/mp4", bytes: 1_000_000 },
  { contentType: "image/jpeg", bytes: 20_000 },
];

describe("issueVideoUpload", () => {
  it("records the grant and signs the video and thumbnail keys", async () => {
    const { deps, payload, storage } = fakes();
    const grant = await issueVideoUpload(deps, {
      userId: "u1",
      communityId: "c1",
      visibility: "community",
    });
    expect(grant.uploadId).toBe(UPLOAD);
    expect(payload.create).toHaveBeenCalledWith({
      collection: "video-uploads",
      data: {
        uploadId: UPLOAD,
        userId: "u1",
        communityId: "c1",
        visibility: "community",
      },
    });
    expect(storage.presignUpload.mock.calls.map(([c]: unknown[]) => c)).toEqual(
      [
        {
          key: `private/videos/c1/${UPLOAD}.mp4`,
          contentType: "video/mp4",
          maxBytes: 40 * 1024 * 1024,
        },
        {
          key: `private/videos/c1/${UPLOAD}.jpg`,
          contentType: "image/jpeg",
          maxBytes: 512 * 1024,
        },
      ],
    );
  });

  it("stops at 20 uploads a day", async () => {
    const { deps } = fakes({ recent: 20 });
    await expect(
      issueVideoUpload(deps, {
        userId: "u1",
        communityId: "c1",
        visibility: "public",
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

describe("finishVideoPost", () => {
  it("creates the post only after both files check out, then closes the grant", async () => {
    const { deps, payload } = fakes({
      uploads: [upload()],
      heads: goodHeads(),
    });
    const post = await finishVideoPost(deps, finish);
    // The client gets the id only: storage keys never leave the server.
    expect(post).toEqual({ id: 7 });
    expect(payload.create.mock.calls[0]![0].data).toMatchObject({
      content: "Demo",
      visibility: "public",
      video: {
        key: `media/videos/public/c1/${UPLOAD}.mp4`,
        thumbnailKey: `media/videos/public/c1/${UPLOAD}.jpg`,
        storage: "public",
        durationSeconds: 42,
        width: 720,
        height: 1280,
        bytes: 1_000_000,
      },
    });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "video-uploads",
      id: 3,
      data: { finishedAt: NOW.toISOString() },
    });
  });

  it("refuses a second finish for the same upload (double submit)", async () => {
    const { deps, payload } = fakes({
      uploads: [upload({ finishedAt: NOW.toISOString() })],
    });
    await expect(finishVideoPost(deps, finish)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("refuses a concurrent second finish that loses the unique video key race, keeping the files", async () => {
    for (const path of ["video.key", "video_key"]) {
      const { deps, payload, storage } = fakes({
        uploads: [upload()],
        heads: goodHeads(),
      });
      payload.create.mockRejectedValueOnce(
        new ValidationError({
          collection: "feed-posts",
          errors: [{ message: "Value must be unique", path }],
        }),
      );
      await expect(finishVideoPost(deps, finish)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "That upload has expired. Please try again.",
      });
      expect(storage.remove).not.toHaveBeenCalled();
      expect(payload.delete).not.toHaveBeenCalled();
      expect(payload.update).not.toHaveBeenCalled();
    }
  });

  it("lets any other create failure through unchanged", async () => {
    for (const error of [
      new Error("database is down"),
      new ValidationError({
        collection: "feed-posts",
        errors: [{ message: "This field is required.", path: "content" }],
      }),
    ]) {
      const { deps, payload, storage } = fakes({
        uploads: [upload()],
        heads: goodHeads(),
      });
      payload.create.mockRejectedValueOnce(error);
      await expect(finishVideoPost(deps, finish)).rejects.toBe(error);
      expect(storage.remove).not.toHaveBeenCalled();
    }
  });

  it("returns the existing post when an earlier finish created it but didn't close the grant", async () => {
    const { deps, payload, storage } = fakes({
      uploads: [upload()],
      posts: [{ id: 11, authorId: "u1" }],
      heads: goodHeads(),
    });
    await expect(finishVideoPost(deps, finish)).resolves.toEqual({ id: 11 });
    expect(payload.find).toHaveBeenCalledWith({
      collection: "feed-posts",
      where: {
        and: [
          { "video.key": { equals: `media/videos/public/c1/${UPLOAD}.mp4` } },
          { authorId: { equals: "u1" } },
          { isDeleted: { not_equals: true } },
        ],
      },
      limit: 1,
      depth: 0,
    });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "video-uploads",
      id: 3,
      data: { finishedAt: NOW.toISOString() },
    });
    expect(payload.create).not.toHaveBeenCalled();
    expect(storage.inspect).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("refuses someone else's upload", async () => {
    const { deps } = fakes({ uploads: [upload({ userId: "other" })] });
    await expect(finishVideoPost(deps, finish)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses to finish a grant past the finish window, leaving it for the daily cleanup", async () => {
    const old = new Date(
      NOW.getTime() - (FINISH_WINDOW_HOURS + 1) * 60 * 60 * 1000,
    ).toISOString();
    const { deps, payload, storage } = fakes({
      uploads: [upload({ createdAt: old })],
      heads: goodHeads(),
    });
    await expect(finishVideoPost(deps, finish)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "That upload has expired. Please try again.",
    });
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
    expect(payload.delete).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("deletes the files and refuses when a file is missing, wrong, or too big", async () => {
    for (const heads of [
      [null, { contentType: "image/jpeg", bytes: 10 }],
      [
        { contentType: "video/quicktime", bytes: 10 },
        { contentType: "image/jpeg", bytes: 10 },
      ],
      [
        { contentType: "video/mp4", bytes: 41 * 1024 * 1024 },
        { contentType: "image/jpeg", bytes: 10 },
      ],
    ]) {
      const { deps, storage, payload } = fakes({ uploads: [upload()], heads });
      await expect(finishVideoPost(deps, finish)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(storage.remove).toHaveBeenCalledWith([
        `media/videos/public/c1/${UPLOAD}.mp4`,
        `media/videos/public/c1/${UPLOAD}.jpg`,
      ]);
      expect(payload.delete).toHaveBeenCalledWith({
        collection: "video-uploads",
        id: 3,
      });
    }
  });

  it("still closes the grant with the friendly error when removing the bad files fails", async () => {
    const { deps, storage, payload, log } = fakes({
      uploads: [upload()],
      heads: [null, null],
    });
    const failure = new Error("S3 down");
    storage.remove.mockRejectedValueOnce(failure);
    await expect(finishVideoPost(deps, finish)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The video didn't upload correctly. Please try again.",
    });
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "video-uploads",
      id: 3,
    });
    expect(log).toHaveBeenCalledWith(
      "[feed.finishVideoPost] removing a bad upload failed",
      {
        uploadId: UPLOAD,
        keys: [
          `media/videos/public/c1/${UPLOAD}.mp4`,
          `media/videos/public/c1/${UPLOAD}.jpg`,
        ],
        error: failure,
      },
    );
  });

  it("refuses an impossible length", async () => {
    const { deps } = fakes({
      uploads: [upload()],
      heads: [
        { contentType: "video/mp4", bytes: 10 },
        { contentType: "image/jpeg", bytes: 10 },
      ],
    });
    await expect(
      finishVideoPost(deps, { ...finish, durationSeconds: 400 }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("removePostVideo", () => {
  it("removes both files of a video post and ignores other posts", async () => {
    const { storage } = fakes();
    await removePostVideo(storage, {
      video: { key: "a.mp4", thumbnailKey: "a.jpg" },
    });
    expect(storage.remove).toHaveBeenCalledWith(["a.mp4", "a.jpg"]);
    storage.remove.mockClear();
    await removePostVideo(storage, { video: null });
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe("cleanUpDeletedPostVideo", () => {
  it("removes the files of a deleted video post", async () => {
    const { storage } = fakes();
    await cleanUpDeletedPostVideo(
      () => storage,
      { id: 9, video: { key: "a.mp4", thumbnailKey: "a.jpg" } },
      { context: "feed.deletePost" },
    );
    expect(storage.remove).toHaveBeenCalledWith(["a.mp4", "a.jpg"]);
  });

  it("does not touch storage for a post without a video", async () => {
    const getStorage = vi.fn();
    await cleanUpDeletedPostVideo(
      getStorage,
      { id: 9, video: null },
      { context: "feed.deletePost" },
    );
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("logs a failed cleanup instead of failing the delete", async () => {
    const { storage } = fakes();
    const failure = new Error("Failed to delete: a.mp4 (AccessDenied)");
    storage.remove.mockRejectedValueOnce(failure);
    const log = vi.fn();
    await expect(
      cleanUpDeletedPostVideo(
        () => storage,
        { id: 9, video: { key: "a.mp4", thumbnailKey: "a.jpg" } },
        { context: "feed.deletePost", log },
      ),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("[feed.deletePost] video cleanup failed", {
      postId: 9,
      keys: ["a.mp4", "a.jpg"],
      error: failure,
    });
  });

  it("logs when storage itself is unavailable", async () => {
    const failure = new Error("S3 is not configured for video storage");
    const log = vi.fn();
    await cleanUpDeletedPostVideo(
      () => {
        throw failure;
      },
      { id: 9, video: { key: "a.mp4", thumbnailKey: null } },
      { context: "feed.reviewReport", log },
    );
    expect(log).toHaveBeenCalledWith(
      "[feed.reviewReport] video cleanup failed",
      {
        postId: 9,
        keys: ["a.mp4"],
        error: failure,
      },
    );
  });
});
