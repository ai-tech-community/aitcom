import { describe, expect, it, vi } from "vitest";

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
    const [gallery, plain] = await decorateFeedPosts(
      {} as never,
      {} as never,
      [
        { ...base, galleryBatch: 9 },
        { ...base, id: 2, content: "hi", galleryBatch: null },
      ] as never,
      null,
      vi.fn(),
    );
    expect(gallery).toMatchObject({ id: 1, isGalleryPost: true });
    expect(plain).toMatchObject({ id: 2, isGalleryPost: false });
    expect(gallery).not.toHaveProperty("galleryBatch");
    expect(plain).not.toHaveProperty("galleryBatch");
  });
});
