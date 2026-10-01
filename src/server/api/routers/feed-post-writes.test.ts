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
  count: vi.fn(),
  delete: vi.fn(),
  create: vi.fn(),
};

/** The member's own unused feed post image. */
const ownImage = {
  id: 77,
  url: "https://bucket.s3.test/new.jpg",
  uploadedBy: "u-1",
  purpose: "feed-post",
};
let storedPost: Record<string, unknown> = post;
let storedImage: Record<string, unknown> | null = ownImage;

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
vi.mock("@/lib/gamification", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gamification")>()),
  awardXp: vi.fn(async () => undefined),
}));
vi.mock("@/server/agent/activity", () => ({
  logActivity: vi.fn(async () => undefined),
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
  storedPost = post;
  storedImage = ownImage;
  payload.findByID.mockImplementation(
    async ({ collection }: { collection: string }) =>
      collection === "media" ? storedImage : storedPost,
  );
  payload.count.mockResolvedValue({ totalDocs: 0 });
  payload.delete.mockResolvedValue({ docs: [] });
  // A guarded media write (by `where`) answers with the posts it changed.
  payload.update.mockImplementation(
    async ({
      data,
      where,
    }: {
      data: Record<string, unknown>;
      where?: unknown;
    }) => (where ? { docs: [{ ...post, ...data }] } : { ...post, ...data }),
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
    storedPost = { ...post, visibility: "public" };
    await caller().feed.editPost({
      postId: 5,
      communitySlug: "c",
      content: "Now a picture",
      media: { kind: "image", imageId: 77 },
    });
    const data = payload.update.mock.calls[0]![0].data as Record<
      string,
      unknown
    >;
    expect(data).toMatchObject({
      image: 77,
      visibility: "community",
      video: { key: null, thumbnailKey: null },
    });
    expect(storage.remove).toHaveBeenCalledWith([
      storedVideo.key,
      storedVideo.thumbnailKey,
    ]);
  });

  it("editPost removes the image, deleting the upload, without touching video storage", async () => {
    storedPost = {
      ...post,
      video: null,
      image: 66,
      imageUrl: "https://bucket.s3.test/old.jpg",
    };
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
    expect(data.image).toBeNull();
    expect(data).not.toHaveProperty("visibility");
    expect(storage.remove).not.toHaveBeenCalled();
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "media",
      where: {
        and: [{ id: { equals: 66 } }, { purpose: { equals: "feed-post" } }],
      },
    });
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

  it("editPost leaves a hidden post's media for the moderator", async () => {
    storedPost = { ...post, hiddenAt: "2026-09-24T11:00:00Z" };
    await expect(
      caller().feed.editPost({
        postId: 5,
        communitySlug: "c",
        content: "New",
        media: { kind: "none" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(payload.update).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("editPost refuses when another edit changed the media first, keeping the files", async () => {
    payload.update.mockResolvedValue({ docs: [] });
    await expect(
      caller().feed.editPost({
        postId: 5,
        communitySlug: "c",
        content: "New",
        media: { kind: "none" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("editPost refuses an image that is not the member's own feed post image", async () => {
    for (const image of [
      null,
      { ...ownImage, uploadedBy: "someone-else" },
      { ...ownImage, purpose: null },
    ]) {
      storedImage = image;
      await expect(
        caller().feed.editPost({
          postId: 5,
          communitySlug: "c",
          content: "New",
          media: { kind: "image", imageId: 77 },
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("editPost refuses an image another post already shows", async () => {
    payload.count.mockResolvedValue({ totalDocs: 1 });
    await expect(
      caller().feed.editPost({
        postId: 5,
        communitySlug: "c",
        content: "New",
        media: { kind: "image", imageId: 77 },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(payload.count).toHaveBeenCalledWith({
      collection: "feed-posts",
      where: {
        and: [{ image: { equals: 77 } }, { id: { not_equals: 5 } }],
      },
    });
  });

  it("createPost links the member's own image", async () => {
    payload.create.mockResolvedValue({ id: 8 });
    await caller().feed.createPost({
      communitySlug: "c",
      content: "Look",
      imageId: 77,
    });
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "feed-posts",
        data: expect.objectContaining({ image: 77 }),
      }),
    );
  });

  it("deletePost also deletes the post's image upload", async () => {
    storedPost = { ...post, video: null, image: { id: 66, url: "u" } };
    await caller().feed.deletePost({ postId: 5 });
    expect(payload.update.mock.calls[0]![0].data).toMatchObject({
      isDeleted: true,
      image: null,
    });
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "media",
      where: {
        and: [{ id: { equals: 66 } }, { purpose: { equals: "feed-post" } }],
      },
    });
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
