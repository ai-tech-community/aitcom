// Router-level tests: writes to a post answer with its id, never the stored
// document (which carries the video's storage keys).
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = {
  membership: undefined as { role: string } | undefined,
  poster: { id: "c-1" } as { id: string } | Error,
};

const storedVideo = {
  key: "private/videos/c-1/u.mp4",
  thumbnailKey: "private/videos/c-1/u.jpg",
  storage: "private",
  durationSeconds: 12,
  width: 720,
  height: 1280,
  bytes: 9,
};

const post = {
  id: 5,
  authorId: "u-1",
  communityId: "c-1",
  visibility: "community",
  hiddenAt: null,
  reportCount: 0,
  isDeleted: false,
  video: storedVideo,
};

const payload = {
  findByID: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
};

const storage = { remove: vi.fn() };

vi.mock("@/server/db", () => ({
  db: {
    query: {
      communityMemberships: { findFirst: async () => hooks.membership },
      communities: { findFirst: async () => undefined },
    },
  },
}));
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/test",
    NEXT_PUBLIC_APP_URL: "https://app.test",
  },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => payload }));
vi.mock("@/server/media/video-storage", () => ({
  getVideoStorage: () => storage,
}));
vi.mock("@/server/communities/feed-posts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/communities/feed-posts")>()),
  requireFeedPoster: vi.fn(async () => {
    if (hooks.poster instanceof Error) throw hooks.poster;
    return hooks.poster;
  }),
}));

import { createCaller } from "@/server/api/root";
import { db as mockedDb } from "@/server/db";

function caller(userId = "u-1") {
  return createCaller({
    db: mockedDb,
    session: { user: { id: userId } } as never,
    headers: new Headers(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.membership = { role: "member" };
  hooks.poster = { id: "c-1" };
  payload.findByID.mockResolvedValue(post);
  payload.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...post,
      ...data,
    }),
  );
  storage.remove.mockResolvedValue(undefined);
});

describe("feed post writes", () => {
  it("editPost answers with the id only", async () => {
    const result = await caller().feed.editPost({
      postId: 5,
      communitySlug: "c",
      content: "New",
    });
    expect(result).toEqual({ id: 5 });
    expect(JSON.stringify(result)).not.toMatch(/key|thumbnailKey/);
  });

  it("editPost keeps the media unless asked to change it", async () => {
    await caller().feed.editPost({
      postId: 5,
      communitySlug: "c",
      content: "New",
    });
    const data = payload.update.mock.calls[0]![0].data as Record<
      string,
      unknown
    >;
    expect(data).not.toHaveProperty("imageUrl");
    expect(data).not.toHaveProperty("video");
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("editPost swaps a public post's video for an image: members-only, old files removed", async () => {
    payload.findByID.mockResolvedValue({ ...post, visibility: "public" });
    await caller().feed.editPost({
      postId: 5,
      communitySlug: "c",
      content: "Now a picture",
      media: { kind: "image", url: "https://bucket.s3.test/new.jpg" },
    });
    const data = payload.update.mock.calls[0]![0].data as Record<
      string,
      unknown
    >;
    expect(data).toMatchObject({
      imageUrl: "https://bucket.s3.test/new.jpg",
      visibility: "community",
      video: { key: null, thumbnailKey: null },
    });
    expect(storage.remove).toHaveBeenCalledWith([
      storedVideo.key,
      storedVideo.thumbnailKey,
    ]);
  });

  it("editPost removes media without touching storage when there was no video", async () => {
    payload.findByID.mockResolvedValue({
      ...post,
      video: null,
      imageUrl: "https://bucket.s3.test/old.jpg",
    });
    await caller().feed.editPost({
      postId: 5,
      communitySlug: "c",
      content: "Text only",
      media: { kind: "none" },
    });
    const data = payload.update.mock.calls[0]![0].data as Record<
      string,
      unknown
    >;
    expect(data.imageUrl).toBeNull();
    expect(data).not.toHaveProperty("visibility");
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("editPost still succeeds when the old video's files cannot be removed", async () => {
    storage.remove.mockRejectedValue(new Error("s3 down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        caller().feed.editPost({
          postId: 5,
          communitySlug: "c",
          content: "Text only",
          media: { kind: "none" },
        }),
      ).resolves.toEqual({ id: 5 });
      expect(log).toHaveBeenCalledWith(
        "[feed.editPost] video cleanup failed",
        expect.objectContaining({ postId: 5 }),
      );
    } finally {
      log.mockRestore();
    }
  });

  it("editPost needs the right to post to change media", async () => {
    const { TRPCError } = await import("@trpc/server");
    hooks.poster = new TRPCError({ code: "FORBIDDEN" });
    await expect(
      caller().feed.editPost({
        postId: 5,
        communitySlug: "c",
        content: "New",
        media: { kind: "none" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("editPost refuses media changes through another community", async () => {
    hooks.poster = { id: "other" };
    await expect(
      caller().feed.editPost({
        postId: 5,
        communitySlug: "other",
        content: "New",
        media: { kind: "none" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("editPost lets only the author edit", async () => {
    await expect(
      caller("someone-else").feed.editPost({
        postId: 5,
        communitySlug: "c",
        content: "New",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("deletePost answers with the id only", async () => {
    const result = await caller().feed.deletePost({ postId: 5 });
    expect(result).toEqual({ id: 5 });
    expect(JSON.stringify(result)).not.toMatch(/key|thumbnailKey/);
    expect(storage.remove).toHaveBeenCalledWith([
      storedVideo.key,
      storedVideo.thumbnailKey,
    ]);
  });
});
