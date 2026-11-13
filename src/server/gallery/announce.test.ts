import { TRPCError } from "@trpc/server";
import { ValidationError } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GalleryBatch } from "@/payload-types";

const m = vi.hoisted(() => ({
  activeCommunityRole: vi.fn(),
  resolvePostTopic: vi.fn(),
  awardXp: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock("@/server/communities/content-visibility-queries", () => ({
  activeCommunityRole: m.activeCommunityRole,
}));
vi.mock("@/server/communities/post-topics", () => ({
  DEFAULT_TOPIC: "general",
  resolvePostTopic: m.resolvePostTopic,
}));
vi.mock("@/lib/gamification", () => ({
  awardXp: m.awardXp,
  XP_AMOUNTS: { FEED_POST_CREATE: 10 },
}));
vi.mock("@/server/agent/activity", () => ({
  logActivity: m.logActivity,
}));

import { galleryAnnouncer } from "./announce";

const batch = (over: Partial<GalleryBatch> = {}): GalleryBatch => ({
  id: 3,
  communityId: "c1",
  uploaderId: "u1",
  topicSlug: "trips",
  visibility: "public",
  caption: "Our meetup with @Jane Doe",
  plannedFiles: 2,
  plannedVideos: 0,
  status: "finished",
  feedPostId: null,
  updatedAt: "2026-11-13T12:00:00.000Z",
  createdAt: "2026-11-13T11:00:00.000Z",
  ...over,
});

function duplicateBatchError(path = "galleryBatch") {
  return new ValidationError({
    collection: "feed-posts",
    errors: [{ message: "Value must be unique", path }],
  });
}

function fakes(
  over: {
    community?: { feedPostPolicy: "all_members" | "admins_only" };
    role?: string | null;
    user?: { name: string | null } | undefined;
    existingPosts?: { id: number }[];
  } = {},
) {
  const payload = {
    create: vi.fn().mockResolvedValue({ id: 77 }),
    find: vi.fn().mockResolvedValue({ docs: over.existingPosts ?? [] }),
  };
  const db = {
    query: {
      communities: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            "community" in over
              ? over.community
              : { feedPostPolicy: "all_members" },
          ),
      },
      user: {
        findFirst: vi
          .fn()
          .mockResolvedValue("user" in over ? over.user : { name: "Uma" }),
      },
    },
  };
  m.activeCommunityRole.mockResolvedValue(
    "role" in over ? over.role : "member",
  );
  const log = vi.fn();
  const announce = galleryAnnouncer({
    payload: payload as never,
    db: db as never,
    log,
  });
  return { payload, db, log, announce };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.resolvePostTopic.mockImplementation(
    (_payload: unknown, _communityId: string, slug: string | undefined) =>
      Promise.resolve(slug ?? "general"),
  );
  m.awardXp.mockResolvedValue(undefined);
  m.logActivity.mockResolvedValue({});
});

describe("galleryAnnouncer", () => {
  it("makes one community feed post for the batch, as its uploader, and returns its id", async () => {
    const { payload, db, announce } = fakes();

    await expect(announce(batch(), [])).resolves.toBe(77);

    expect(payload.create).toHaveBeenCalledTimes(1);
    expect(payload.create).toHaveBeenCalledWith({
      collection: "feed-posts",
      data: {
        content: "Our meetup with @Jane Doe",
        authorId: "u1",
        authorName: "Uma",
        communityId: "c1",
        likeCount: 0,
        commentCount: 0,
        topicSlug: "trips",
        // Always community, whatever the batch's own visibility.
        visibility: "community",
        galleryBatch: 3,
      },
    });
    expect(m.activeCommunityRole).toHaveBeenCalledWith(db, "c1", "u1");
    expect(m.resolvePostTopic).toHaveBeenCalledWith(payload, "c1", "trips");
  });

  it("mentions no one, even when the caption says @Name", async () => {
    const { payload, announce } = fakes();

    await announce(batch(), []);

    const { data } = payload.create.mock.calls[0]![0];
    expect(data.content).toBe("Our meetup with @Jane Doe");
    expect(data).not.toHaveProperty("mentions");
  });

  it("awards the post's XP and logs the post like a written one", async () => {
    const { db, announce } = fakes();

    await announce(batch(), []);

    expect(m.awardXp).toHaveBeenCalledWith(db, "u1", 10);
    expect(m.logActivity).toHaveBeenCalledWith(db, {
      actorId: "u1",
      actorType: "member",
      action: "feed.post_created",
      targetType: "feed-posts",
      targetId: "77",
      communityId: "c1",
      metadata: { communityId: "c1", postId: 77, kind: "gallery" },
    });
  });

  it("posts an empty text for a batch without a caption", async () => {
    const { payload, announce } = fakes();

    await announce(batch({ caption: null }), []);

    expect(payload.create.mock.calls[0]![0].data.content).toBe("");
  });

  it("files the post under general when the batch has no topic", async () => {
    const { payload, announce } = fakes();

    await announce(batch({ topicSlug: null }), []);

    expect(m.resolvePostTopic).toHaveBeenCalledWith(payload, "c1", undefined);
    expect(payload.create.mock.calls[0]![0].data.topicSlug).toBe("general");
  });

  it("files the post under general when the batch's topic was deleted", async () => {
    const { payload, announce } = fakes();
    m.resolvePostTopic.mockRejectedValue(
      new TRPCError({ code: "BAD_REQUEST", message: "no such topic" }),
    );

    await expect(announce(batch(), [])).resolves.toBe(77);

    expect(payload.create.mock.calls[0]![0].data.topicSlug).toBe("general");
  });

  it("does not hide a failure to read the topics", async () => {
    const { payload, announce } = fakes();
    m.resolvePostTopic.mockRejectedValue(new Error("db down"));

    await expect(announce(batch(), [])).rejects.toThrow("db down");
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("names the author 'member' when the user has no name", async () => {
    const { payload, announce } = fakes({ user: { name: null } });

    await announce(batch(), []);

    expect(payload.create.mock.calls[0]![0].data.authorName).toBe("member");
  });

  it.each([
    ["left, was banned, or lost paid access", { role: null }],
    [
      "is a plain member under an admins-only feed",
      {
        role: "member",
        community: { feedPostPolicy: "admins_only" as const },
      },
    ],
    ["belongs to a community that was deleted", { community: undefined }],
  ])(
    "makes no post, and awards nothing, when the uploader %s",
    async (_why, over) => {
      const { payload, announce } = fakes(over);

      await expect(announce(batch(), [])).resolves.toBeNull();

      expect(payload.create).not.toHaveBeenCalled();
      expect(m.awardXp).not.toHaveBeenCalled();
      expect(m.logActivity).not.toHaveBeenCalled();
    },
  );

  it.each(["owner", "admin", "moderator"])(
    "lets a %s post under an admins-only feed",
    async (role) => {
      const { announce } = fakes({
        role,
        community: { feedPostPolicy: "admins_only" },
      });

      await expect(announce(batch(), [])).resolves.toBe(77);
    },
  );

  it.each(["galleryBatch", "gallery_batch_id"])(
    "returns the post another call already made for the batch (unique %s)",
    async (path) => {
      const { payload, announce } = fakes({ existingPosts: [{ id: 55 }] });
      payload.create.mockRejectedValue(duplicateBatchError(path));

      await expect(announce(batch(), [])).resolves.toBe(55);

      expect(payload.find).toHaveBeenCalledWith({
        collection: "feed-posts",
        where: { galleryBatch: { equals: 3 } },
        limit: 1,
        depth: 0,
      });
      // The first call already awarded and logged that post.
      expect(m.awardXp).not.toHaveBeenCalled();
      expect(m.logActivity).not.toHaveBeenCalled();
    },
  );

  it("passes on a unique failure when no post holds the batch", async () => {
    const { payload, announce } = fakes({ existingPosts: [] });
    const error = duplicateBatchError();
    payload.create.mockRejectedValue(error);

    await expect(announce(batch(), [])).rejects.toBe(error);
  });

  it("passes on any other failure to save the post", async () => {
    const { payload, announce } = fakes();
    const invalid = new ValidationError({
      collection: "feed-posts",
      errors: [{ message: "too long", path: "content" }],
    });
    payload.create.mockRejectedValue(invalid);

    await expect(announce(batch(), [])).rejects.toBe(invalid);
    expect(payload.find).not.toHaveBeenCalled();
  });

  it("keeps the post, and logs, when awarding the XP fails", async () => {
    const { announce, log } = fakes();
    const error = new Error("xp down");
    m.awardXp.mockRejectedValue(error);

    await expect(announce(batch(), [])).resolves.toBe(77);

    expect(m.logActivity).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "[gallery.announce] awarding XP for a gallery post failed",
      { batchId: 3, postId: 77, error },
    );
  });

  it("keeps the post, and logs, when logging the activity fails", async () => {
    const { announce, log } = fakes();
    const error = new Error("log down");
    m.logActivity.mockRejectedValue(error);

    await expect(announce(batch(), [])).resolves.toBe(77);

    expect(log).toHaveBeenCalledWith(
      "[gallery.announce] logging a gallery post failed",
      { batchId: 3, postId: 77, error },
    );
  });
});
