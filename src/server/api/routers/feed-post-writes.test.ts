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
  // The media claim (and counters) run as single SQL statements.
  db: { drizzle: { execute: vi.fn() } },
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
const gif = {
  giphyId: "abc123",
  title: "Party parrot",
  mp4Url: "https://media.giphy.com/media/abc123/giphy.mp4",
  stillUrl: "https://media.giphy.com/media/abc123/giphy_s.gif",
  width: 400,
  height: 300,
  preview: {
    mp4Url: "https://media.giphy.com/media/abc123/200w.mp4",
    stillUrl: "https://media.giphy.com/media/abc123/200w_s.gif",
    width: 200,
    height: 150,
  },
};
const giphy = {
  byId: vi.fn(),
  search: vi.fn(),
  trending: vi.fn(),
};
vi.mock("@/server/giphy/giphy", () => ({ getGiphyClient: () => giphy }));
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
  payload.findByID.mockImplementation(async () => storedPost);
  payload.find.mockImplementation(
    async ({ collection }: { collection: string }) => ({
      docs: collection === "media" && storedImage ? [storedImage] : [],
    }),
  );
  payload.count.mockResolvedValue({ totalDocs: 0 });
  payload.db.drizzle.execute.mockResolvedValue({ rows: [{ id: 5 }] });
  giphy.byId.mockImplementation(async (id: string) =>
    id === gif.giphyId ? gif : null,
  );
  giphy.trending.mockResolvedValue({ gifs: [gif], nextOffset: 24 });
  giphy.search.mockResolvedValue({ gifs: [gif], nextOffset: null });
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
      media: { kind: "images", images: [{ id: 77, alt: "" }] },
    });
    const data = payload.update.mock.calls[0]![0].data as Record<
      string,
      unknown
    >;
    expect(data).toMatchObject({
      images: [77],
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
      images: [66],
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
    expect(data.images).toEqual([]);
    expect(data).not.toHaveProperty("visibility");
    expect(storage.remove).not.toHaveBeenCalled();
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "media",
      where: {
        and: [{ id: { in: [66] } }, { purpose: { equals: "feed-post" } }],
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
    payload.db.drizzle.execute.mockResolvedValue({ rows: [] });
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
          media: { kind: "images", images: [{ id: 77, alt: "" }] },
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
        media: { kind: "images", images: [{ id: 77, alt: "" }] },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(payload.count).toHaveBeenCalledWith({
      collection: "feed-posts",
      where: {
        and: [{ images: { in: [77] } }, { id: { not_equals: 5 } }],
      },
    });
  });

  it("createPost links the member's own image", async () => {
    payload.create.mockResolvedValue({ id: 8 });
    await caller().feed.createPost({
      communitySlug: "c",
      content: "Look",
      images: [{ id: 77, alt: "" }],
    });
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "feed-posts",
        data: expect.objectContaining({ images: [77] }),
      }),
    );
  });

  it("deletePost also deletes the post's image upload", async () => {
    storedPost = { ...post, video: null, images: [{ id: 66, url: "u" }] };
    await caller().feed.deletePost({ postId: 5 });
    expect(payload.update.mock.calls[0]![0].data).toMatchObject({
      isDeleted: true,
      images: [],
    });
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "media",
      where: {
        and: [{ id: { in: [66] } }, { purpose: { equals: "feed-post" } }],
      },
    });
  });

  it("editPost puts a GIF looked up on GIPHY in place of a public video", async () => {
    storedPost = { ...post, visibility: "public" };
    await caller().feed.editPost({
      postId: 5,
      communitySlug: "c",
      content: "Party",
      media: { kind: "gif", giphyId: "abc123" },
    });
    expect(giphy.byId).toHaveBeenCalledWith("abc123");
    expect(payload.update.mock.calls[0]![0].data).toMatchObject({
      gif: {
        giphyId: "abc123",
        mp4Url: gif.mp4Url,
        stillUrl: gif.stillUrl,
        width: 400,
        height: 300,
      },
      images: [],
      visibility: "community",
      video: { key: null },
    });
    expect(storage.remove).toHaveBeenCalled();
  });

  it("editPost refuses a GIF GIPHY does not know", async () => {
    await expect(
      caller().feed.editPost({
        postId: 5,
        communitySlug: "c",
        content: "Party",
        media: { kind: "gif", giphyId: "gone" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("editPost with a picture clears a GIF", async () => {
    storedPost = { ...post, video: null, gif: { giphyId: "abc123" } };
    await caller().feed.editPost({
      postId: 5,
      communitySlug: "c",
      content: "A picture now",
      media: { kind: "images", images: [{ id: 77, alt: "" }] },
    });
    expect(payload.update.mock.calls[0]![0].data).toMatchObject({
      images: [77],
      gif: { giphyId: null, mp4Url: null },
    });
  });

  it("createPost stores a GIF looked up by id, and refuses a picture and a GIF together", async () => {
    payload.create.mockResolvedValue({ id: 8 });
    await caller().feed.createPost({
      communitySlug: "c",
      content: "Weekend",
      gifId: "abc123",
    });
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gif: expect.objectContaining({ giphyId: "abc123" }),
        }),
      }),
    );
    await expect(
      caller().feed.createPost({
        communitySlug: "c",
        content: "Both",
        images: [{ id: 77, alt: "" }],
        gifId: "abc123",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("searchGifs is for members who may post, trending without a query", async () => {
    await expect(
      caller().feed.searchGifs({ communitySlug: "c" }),
    ).resolves.toEqual({ gifs: [gif], nextCursor: 24 });
    expect(giphy.trending).toHaveBeenCalledWith({ offset: 0 });
    await caller().feed.searchGifs({
      communitySlug: "c",
      query: "party",
      cursor: 24,
      lang: "nl",
    });
    expect(giphy.search).toHaveBeenCalledWith({
      query: "party",
      offset: 24,
      lang: "nl",
    });
    const { TRPCError } = await import("@trpc/server");
    hooks.poster = new TRPCError({ code: "FORBIDDEN" });
    await expect(
      caller().feed.searchGifs({ communitySlug: "c" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("searchGifs limits each member, so one member cannot use up GIPHY for everyone", async () => {
    const heavy = caller("gif-heavy-user");
    for (let i = 0; i < 60; i++) {
      await heavy.feed.searchGifs({ communitySlug: "c" });
    }
    await expect(
      heavy.feed.searchGifs({ communitySlug: "c" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(
      caller("someone-else").feed.searchGifs({ communitySlug: "c" }),
    ).resolves.toBeDefined();
  }, 30_000);

  it("editPost moves a post only to one of its community's topics", async () => {
    payload.count.mockImplementation(async ({ where }: { where: unknown }) => ({
      totalDocs: JSON.stringify(where).includes('"jobs"') ? 1 : 0,
    }));
    await caller().feed.editPost({
      postId: 5,
      communitySlug: "c",
      content: "Hiring",
      topicSlug: "jobs",
    });
    expect(payload.update.mock.calls.at(-1)![0].data).toMatchObject({
      topicSlug: "jobs",
    });
    await expect(
      caller().feed.editPost({
        postId: 5,
        communitySlug: "c",
        content: "Elsewhere",
        topicSlug: "another-community-topic",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("editPost hides the link preview, keeping what it says", async () => {
    storedPost = {
      ...post,
      content: "Read https://x.test/a",
      linkPreview: { url: "https://x.test/a", title: "A page", hidden: false },
    };
    await caller().feed.editPost({
      postId: 5,
      communitySlug: "c",
      content: "Read https://x.test/a",
      linkPreviewHidden: true,
    });
    expect(payload.update.mock.calls.at(-1)![0].data).toMatchObject({
      linkPreview: { url: "https://x.test/a", title: "A page", hidden: true },
    });
  });

  it("createPost refuses a topic that is not in the community", async () => {
    await expect(
      caller().feed.createPost({
        communitySlug: "c",
        content: "Hi",
        topicSlug: "nope",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("editPost moving a post needs the right to post, and leaves a post under review alone", async () => {
    payload.count.mockResolvedValue({ totalDocs: 1 });
    const { TRPCError } = await import("@trpc/server");
    hooks.poster = new TRPCError({ code: "FORBIDDEN" });
    await expect(
      caller().feed.editPost({
        postId: 5,
        communitySlug: "c",
        content: "Moved",
        topicSlug: "jobs",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    hooks.poster = { id: "c-1" };
    storedPost = { ...post, hiddenAt: "2026-09-24T11:00:00Z" };
    await expect(
      caller().feed.editPost({
        postId: 5,
        communitySlug: "c",
        content: "Moved",
        topicSlug: "jobs",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(payload.update).not.toHaveBeenCalled();
    // A text-only fix needs neither.
    await caller().feed.editPost({
      postId: 5,
      communitySlug: "c",
      content: "Typo fixed",
    });
    expect(payload.update).toHaveBeenCalled();
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
