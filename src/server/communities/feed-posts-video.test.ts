import { describe, expect, it, vi } from "vitest";

import { decorateFeedPosts } from "./feed-posts";

const base = {
  id: 1,
  content: "hi",
  authorId: "",
  communityId: "c1",
  topicSlug: "general",
  createdAt: "2026-09-24T00:00:00.000Z",
  updatedAt: "2026-09-24T00:00:00.000Z",
  visibility: "community" as const,
};

describe("decorateFeedPosts video view", () => {
  it("swaps storage keys for playback links and keeps posts without video as null", async () => {
    const storage = {
      playbackUrl: vi
        .fn()
        .mockImplementation((key: string, cls: string) =>
          Promise.resolve(`${cls}:${key}`),
        ),
      presignUpload: vi.fn(),
      inspect: vi.fn(),
      remove: vi.fn(),
    };
    const [withVideo, plain] = await decorateFeedPosts(
      {} as never,
      {} as never,
      [
        {
          ...base,
          video: {
            key: "private/videos/c1/u.mp4",
            thumbnailKey: "private/videos/c1/u.jpg",
            storage: "private",
            durationSeconds: 12,
            width: 720,
            height: 1280,
            bytes: 9,
          },
        },
        { ...base, id: 2 },
      ] as never,
      null,
      () => storage,
    );
    expect(withVideo!.video).toEqual({
      url: "private:private/videos/c1/u.mp4",
      thumbnailUrl: "private:private/videos/c1/u.jpg",
      durationSeconds: 12,
      width: 720,
      height: 1280,
      visibility: "community",
    });
    expect(JSON.stringify(withVideo)).not.toContain('"key"');
    expect(plain!.video).toBeNull();
  });

  it("keeps the report count for moderators only (not in the view)", async () => {
    const [view] = await decorateFeedPosts(
      {} as never,
      {} as never,
      [
        { ...base, reportCount: 2, hiddenAt: "2026-09-24T00:00:00.000Z" },
      ] as never,
      null,
      vi.fn(),
    );
    expect(view).not.toHaveProperty("reportCount");
    expect(view).toHaveProperty("hiddenAt", "2026-09-24T00:00:00.000Z");
  });

  it("never reaches video storage when no post has a video", async () => {
    const storage = vi.fn(() => {
      throw new Error("S3 is not configured for video storage");
    });
    const views = await decorateFeedPosts(
      {} as never,
      {} as never,
      [base, { ...base, id: 2 }] as never,
      null,
      storage,
    );
    expect(storage).not.toHaveBeenCalled();
    expect(views.map((view) => view.video)).toEqual([null, null]);
  });
});
