import { afterEach, describe, expect, it, vi } from "vitest";

const galleryViewsForPosts = vi.hoisted(() => vi.fn());
vi.mock("@/server/gallery/feed-view", () => ({ galleryViewsForPosts }));

import {
  canPostToFeed,
  decorateFeedPosts,
  requireActiveFeedMember,
} from "./feed-posts";

describe("canPostToFeed", () => {
  it("lets every member post when the policy is all_members", () => {
    expect(canPostToFeed("all_members", "member")).toBe(true);
  });
  it("limits admins_only communities to owners, admins, and moderators", () => {
    expect(canPostToFeed("admins_only", "member")).toBe(false);
    expect(canPostToFeed("admins_only", "moderator")).toBe(true);
    expect(canPostToFeed("admins_only", "owner")).toBe(true);
  });
});

describe("requireActiveFeedMember", () => {
  it("refuses a non-member with a neutral message (used for reading and posting)", async () => {
    const database = {
      query: {
        communities: {
          findFirst: async () => ({
            id: "c1",
            slug: "makers",
            feedPostPolicy: "all_members",
          }),
        },
        communityMemberships: { findFirst: async () => undefined },
      },
    };
    await expect(
      requireActiveFeedMember(database as never, "makers", "u1"),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Must be an active community member",
    });
  });
});

describe("decorateFeedPosts gallery posts", () => {
  const base = {
    id: 1,
    content: "",
    authorId: "",
    communityId: "c1",
    topicSlug: "general",
    createdAt: "2026-11-13T00:00:00.000Z",
    updatedAt: "2026-11-13T00:00:00.000Z",
    visibility: "community" as const,
  };

  it("says which posts are gallery posts, without sending the batch id", async () => {
    galleryViewsForPosts.mockResolvedValue(new Map());
    const [gallery, plain] = await decorateFeedPosts(
      {
        database: {} as never,
        payload: {} as never,
        videoStorage: vi.fn(),
        galleryStorage: vi.fn(),
      },
      [
        { ...base, galleryBatch: 9 },
        { ...base, id: 2, content: "hi", galleryBatch: null },
      ] as never,
      null,
    );
    expect(gallery).toMatchObject({ id: 1, isGalleryPost: true });
    expect(plain).toMatchObject({ id: 2, isGalleryPost: false });
    expect(gallery).not.toHaveProperty("galleryBatch");
    expect(plain).not.toHaveProperty("galleryBatch");
  });

  it("adds what the viewer may see of each batch, read with the gallery's storage", async () => {
    const database = { tag: "db" };
    const payload = { find: vi.fn(async () => ({ docs: [] })) };
    const videoStorage = vi.fn();
    const galleryStorage = vi.fn();
    const collage = { batchId: 9, items: [], total: 4 };
    galleryViewsForPosts.mockResolvedValue(
      new Map([
        [1, collage],
        [2, null],
      ]),
    );
    const posts = [
      { ...base, galleryBatch: 9 },
      { ...base, id: 2, content: "hi", galleryBatch: null },
    ];

    const [gallery, plain] = await decorateFeedPosts(
      {
        database: database as never,
        payload: payload as never,
        videoStorage,
        galleryStorage,
      },
      posts as never,
      "u2",
    );

    expect(galleryViewsForPosts).toHaveBeenLastCalledWith(
      { db: database, payload, storage: galleryStorage },
      posts,
      "u2",
    );
    expect(gallery!.gallery).toBe(collage);
    expect(plain!.gallery).toBeNull();
    expect(galleryStorage).not.toHaveBeenCalled();
    expect(videoStorage).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("still shows the feed, without collages, when the gallery read fails", async () => {
    const error = new Error("gallery down");
    galleryViewsForPosts.mockRejectedValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const [gallery, plain] = await decorateFeedPosts(
      {
        database: {} as never,
        payload: {} as never,
        videoStorage: vi.fn(),
        galleryStorage: vi.fn(),
      },
      [
        { ...base, content: "Our picnic", galleryBatch: 9 },
        { ...base, id: 2, content: "hi", galleryBatch: null },
      ] as never,
      null,
    );
    expect(gallery).toMatchObject({
      id: 1,
      content: "Our picnic",
      isGalleryPost: true,
      gallery: null,
    });
    expect(plain).toMatchObject({ id: 2, gallery: null });
    expect(log).toHaveBeenCalledWith(
      "[feed] reading the posts' gallery collages failed",
      { postIds: [1, 2], error },
    );
  });

  it("reads the batches as a signed-out visitor when no one is signed in", async () => {
    galleryViewsForPosts.mockResolvedValue(new Map());
    const [view] = await decorateFeedPosts(
      {
        database: {} as never,
        payload: {} as never,
        videoStorage: vi.fn(),
        galleryStorage: vi.fn(),
      },
      [{ ...base, galleryBatch: 9 }] as never,
      undefined,
    );
    expect(galleryViewsForPosts.mock.lastCall![2]).toBeNull();
    // A post the gallery read left out still says it has no collage.
    expect(view!.gallery).toBeNull();
  });
});
