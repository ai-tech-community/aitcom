// src/server/communities/video-posts.test.ts
import { ValidationError } from "payload";
import { describe, expect, it, vi } from "vitest";

import { FINISH_WINDOW_HOURS } from "@/lib/video-rules";

import {
  finishVideoPost,
  issueVideoUpload,
  replacePostVideo,
} from "./video-posts";

const UPLOAD = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const NOW = new Date("2026-09-24T12:00:00.000Z");

function fakes(
  over: {
    uploads?: unknown[];
    posts?: unknown[];
    recent?: number;
    heads?: unknown[];
    target?: unknown;
    changed?: unknown[];
  } = {},
) {
  const payload = {
    findByID: vi.fn().mockResolvedValue(over.target ?? null),
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
    // A guarded update (by `where`) answers with the posts it changed.
    update: vi
      .fn()
      .mockImplementation(({ where }: { where?: unknown }) =>
        Promise.resolve(where ? { docs: over.changed ?? [{ id: 9 }] } : {}),
      ),
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

const OLD_VIDEO = {
  key: "media/videos/public/c1/old.mp4",
  thumbnailKey: "media/videos/public/c1/old.jpg",
};

const target = (over: Record<string, unknown> = {}) => ({
  id: 9,
  authorId: "u1",
  communityId: "c1",
  visibility: "public",
  isDeleted: false,
  imageUrl: null,
  updatedAt: "2026-09-24T10:00:00.000Z",
  video: OLD_VIDEO,
  ...over,
});

const replace = {
  userId: "u1",
  communityId: "c1",
  postId: 9,
  uploadId: UPLOAD,
  caption: "Better take",
  durationSeconds: 30,
  width: 720,
  height: 1280,
};

describe("replacePostVideo", () => {
  it("puts the checked upload on the post, closes the grant, then removes the old files", async () => {
    const { deps, payload, storage } = fakes({
      uploads: [upload()],
      heads: goodHeads(),
      target: target(),
    });
    await expect(replacePostVideo(deps, replace)).resolves.toEqual({ id: 9 });
    type Call = { collection: string; data: Record<string, unknown> };
    const update = (payload.update.mock.calls as [Call][])
      .map(([c]) => c)
      .find((c) => c.collection === "feed-posts")!;
    expect(update.data).toMatchObject({
      content: "Better take",
      images: [],
      isEdited: true,
      video: {
        key: `media/videos/public/c1/${UPLOAD}.mp4`,
        thumbnailKey: `media/videos/public/c1/${UPLOAD}.jpg`,
        storage: "public",
        durationSeconds: 30,
        bytes: 1_000_000,
      },
    });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "video-uploads",
      id: 3,
      data: { finishedAt: NOW.toISOString() },
    });
    expect(storage.remove).toHaveBeenCalledWith([
      OLD_VIDEO.key,
      OLD_VIDEO.thumbnailKey,
    ]);
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("replaces an image post's picture with a video", async () => {
    const { deps, payload, storage } = fakes({
      uploads: [upload({ visibility: "community" })],
      heads: goodHeads(),
      target: target({
        visibility: "community",
        video: null,
        images: [66, 67],
        imageUrl: "https://bucket/img.jpg",
      }),
    });
    await replacePostVideo(deps, replace);
    const update = payload.update.mock.calls[0]![0];
    expect(update.data.images).toEqual([]);
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "media",
      where: {
        and: [{ id: { in: [66, 67] } }, { purpose: { equals: "feed-post" } }],
      },
    });
    expect(update.data.video.storage).toBe("private");
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("keeps the post's audience: an upload granted for another one is refused", async () => {
    const { deps, payload } = fakes({
      uploads: [upload({ visibility: "community" })],
      heads: goodHeads(),
      target: target({ visibility: "public" }),
    });
    await expect(replacePostVideo(deps, replace)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("only lets the author replace, and only in the post's community", async () => {
    const someone = fakes({ uploads: [upload()], target: target() });
    await expect(
      replacePostVideo(someone.deps, { ...replace, userId: "u2" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const elsewhere = fakes({
      uploads: [upload()],
      target: target({ communityId: "c2" }),
    });
    await expect(
      replacePostVideo(elsewhere.deps, replace),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const gone = fakes({
      uploads: [upload()],
      target: target({ isDeleted: true }),
    });
    await expect(replacePostVideo(gone.deps, replace)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("is safe to retry: a post already carrying this upload just closes the grant", async () => {
    const { deps, payload, storage } = fakes({
      uploads: [upload()],
      target: target({
        video: {
          key: `media/videos/public/c1/${UPLOAD}.mp4`,
          thumbnailKey: `media/videos/public/c1/${UPLOAD}.jpg`,
        },
      }),
    });
    await expect(replacePostVideo(deps, replace)).resolves.toEqual({ id: 9 });
    expect(payload.update).toHaveBeenCalledTimes(1);
    expect(payload.update.mock.calls[0]![0].collection).toBe("video-uploads");
    expect(storage.inspect).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("only writes while the post is exactly as it was read", async () => {
    const { deps, payload } = fakes({
      uploads: [upload()],
      heads: goodHeads(),
      target: target(),
    });
    await replacePostVideo(deps, replace);
    const write = payload.update.mock.calls[0]![0];
    expect(write.where).toEqual({
      and: [
        { id: { equals: 9 } },
        { updatedAt: { equals: "2026-09-24T10:00:00.000Z" } },
        { isDeleted: { not_equals: true } },
        { hiddenAt: { exists: false } },
      ],
    });
  });

  it("refuses a lost race: no files removed and the grant stays open", async () => {
    const { deps, payload, storage } = fakes({
      uploads: [upload()],
      heads: goodHeads(),
      target: target(),
      changed: [],
    });
    await expect(replacePostVideo(deps, replace)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(payload.update).toHaveBeenCalledTimes(1);
  });

  it("removes the old files before closing the grant, so a failed close leaves nothing behind", async () => {
    const { deps, payload, storage } = fakes({
      uploads: [upload()],
      heads: goodHeads(),
      target: target(),
    });
    payload.update.mockImplementation(({ where }: { where?: unknown }) =>
      where
        ? Promise.resolve({ docs: [{ id: 9 }] })
        : Promise.reject(new Error("db down")),
    );
    await expect(replacePostVideo(deps, replace)).rejects.toThrow("db down");
    expect(storage.remove).toHaveBeenCalledWith([
      OLD_VIDEO.key,
      OLD_VIDEO.thumbnailKey,
    ]);
  });

  it("leaves a hidden post's reported video alone until a moderator looks", async () => {
    const { deps, payload, storage } = fakes({
      uploads: [upload()],
      heads: goodHeads(),
      target: target({ hiddenAt: "2026-09-24T11:00:00Z" }),
    });
    await expect(replacePostVideo(deps, replace)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(payload.update).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("removes a bad upload and leaves the post as it was", async () => {
    const { deps, payload, storage } = fakes({
      uploads: [upload()],
      heads: [{ contentType: "text/html", bytes: 10 }, null],
      target: target(),
    });
    await expect(replacePostVideo(deps, replace)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(payload.update).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith([
      `media/videos/public/c1/${UPLOAD}.mp4`,
      `media/videos/public/c1/${UPLOAD}.jpg`,
    ]);
  });
});
