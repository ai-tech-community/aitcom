import { describe, expect, it, vi } from "vitest";

import { cleanUpPostVideoFiles, removePostVideo } from "./post-video-files";

function fakeStorage() {
  return {
    presignUpload: vi.fn(),
    inspect: vi.fn(),
    playbackUrl: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

describe("removePostVideo", () => {
  it("removes both files of a video post and ignores other posts", async () => {
    const storage = fakeStorage();
    await removePostVideo(storage, {
      video: { key: "a.mp4", thumbnailKey: "a.jpg" },
    });
    expect(storage.remove).toHaveBeenCalledWith(["a.mp4", "a.jpg"]);
    storage.remove.mockClear();
    await removePostVideo(storage, { video: null });
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe("cleanUpPostVideoFiles", () => {
  it("removes the files of a deleted video post", async () => {
    const storage = fakeStorage();
    await cleanUpPostVideoFiles(
      () => storage,
      { id: 9, video: { key: "a.mp4", thumbnailKey: "a.jpg" } },
      { context: "feed.deletePost" },
    );
    expect(storage.remove).toHaveBeenCalledWith(["a.mp4", "a.jpg"]);
  });

  it("does not touch storage for a post without a video", async () => {
    const getStorage = vi.fn();
    await cleanUpPostVideoFiles(
      getStorage,
      { id: 9, video: null },
      { context: "feed.deletePost" },
    );
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("logs a failed cleanup instead of failing the delete", async () => {
    const storage = fakeStorage();
    const failure = new Error("Failed to delete: a.mp4 (AccessDenied)");
    storage.remove.mockRejectedValueOnce(failure);
    const log = vi.fn();
    await expect(
      cleanUpPostVideoFiles(
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
    await cleanUpPostVideoFiles(
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
