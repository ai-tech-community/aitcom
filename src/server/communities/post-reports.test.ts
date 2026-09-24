// src/server/communities/post-reports.test.ts
import { ValidationError } from "payload";
import { describe, expect, it, vi } from "vitest";

import { listPostReports, reportPost, reviewReport } from "./post-reports";

const NOW = new Date("2026-09-24T12:00:00.000Z");
const OPEN_REPORTS = {
  and: [{ post: { equals: 5 } }, { dismissedAt: { exists: false } }],
};
const member = { userId: "r1", isMember: true, isModerator: false };

function fakes(
  post: Record<string, unknown> | null,
  over: { existing?: unknown[]; reportTotal?: number } = {},
) {
  const payload = {
    findByID: vi
      .fn()
      .mockImplementation(() =>
        post
          ? Promise.resolve(post)
          : Promise.reject(Object.assign(new Error("nf"), { status: 404 })),
      ),
    find: vi.fn().mockResolvedValue({ docs: over.existing ?? [] }),
    count: vi.fn().mockResolvedValue({ totalDocs: over.reportTotal ?? 1 }),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  };
  const notifyModerators = vi.fn().mockResolvedValue(undefined);
  const storage = { remove: vi.fn().mockResolvedValue(undefined) };
  const getStorage = vi.fn(() => storage);
  const log = vi.fn();
  return {
    payload,
    notifyModerators,
    storage,
    getStorage,
    log,
    deps: {
      payload: payload as never,
      notifyModerators,
      storage: getStorage as never,
      now: () => NOW,
      log,
    },
  };
}

const video = {
  id: 5,
  authorId: "a1",
  communityId: "c1",
  visibility: "public",
  hiddenAt: null,
  reportCount: 0,
  isDeleted: false,
  video: { key: "k.mp4", thumbnailKey: "k.jpg" },
};

describe("reportPost", () => {
  it("records the report, hides the post, and tells moderators once", async () => {
    const { deps, payload, notifyModerators } = fakes(video);
    await expect(
      reportPost(deps, {
        postId: 5,
        reporterId: "r1",
        reason: "spam",
        note: "",
        viewer: member,
      }),
    ).resolves.toEqual({ hidden: true });
    expect(payload.create).toHaveBeenCalledWith({
      collection: "post-reports",
      data: { post: 5, reporterId: "r1", reason: "spam", note: undefined },
    });
    expect(payload.count).toHaveBeenCalledWith({
      collection: "post-reports",
      where: OPEN_REPORTS,
    });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "feed-posts",
      id: 5,
      data: { hiddenAt: NOW.toISOString(), reportCount: 1 },
    });
    expect(notifyModerators).toHaveBeenCalledWith({
      communityId: "c1",
      postId: 5,
      isVideo: true,
    });
  });

  // Once hidden, only the author and moderators still see the post, so a
  // further report can only come from a moderator.
  it("keeps the first hide time, counts every report, and doesn't notify again", async () => {
    const hiddenAt = "2026-09-23T08:00:00.000Z";
    const { deps, payload, notifyModerators } = fakes(
      { ...video, hiddenAt, reportCount: 1 },
      { reportTotal: 2 },
    );
    await reportPost(deps, {
      postId: 5,
      reporterId: "r2",
      reason: "other",
      note: "  x  ",
      viewer: { userId: "r2", isMember: true, isModerator: true },
    });
    expect(payload.create).toHaveBeenCalledWith({
      collection: "post-reports",
      data: { post: 5, reporterId: "r2", reason: "other", note: "x" },
    });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "feed-posts",
      id: 5,
      data: { hiddenAt, reportCount: 2 },
    });
    expect(notifyModerators).not.toHaveBeenCalled();
  });

  it("refuses your own post, a second report, and a post you can't see", async () => {
    await expect(
      reportPost(fakes({ ...video, hiddenAt: NOW.toISOString() }).deps, {
        postId: 5,
        reporterId: "r2",
        reason: "spam",
        note: "",
        viewer: { ...member, userId: "r2" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      reportPost(fakes(video).deps, {
        postId: 5,
        reporterId: "a1",
        reason: "spam",
        note: "",
        viewer: { ...member, userId: "a1" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      reportPost(fakes(video, { existing: [{ id: 1 }] }).deps, {
        postId: 5,
        reporterId: "r1",
        reason: "spam",
        note: "",
        viewer: member,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      reportPost(fakes({ ...video, visibility: "community" }).deps, {
        postId: 5,
        reporterId: "r1",
        reason: "spam",
        note: "",
        viewer: { userId: "r1", isMember: false, isModerator: false },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      reportPost(fakes(null).deps, {
        postId: 5,
        reporterId: "r1",
        reason: "spam",
        note: "",
        viewer: member,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("turns a concurrent duplicate report into the same 'already reported' answer", async () => {
    const { deps, payload } = fakes(video);
    payload.create.mockRejectedValueOnce(
      new ValidationError({
        collection: "post-reports",
        errors: [{ message: "Value must be unique", path: "post" }],
      }),
    );
    await expect(
      reportPost(deps, {
        postId: 5,
        reporterId: "r1",
        reason: "spam",
        note: "",
        viewer: member,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("keeps the report when telling moderators fails", async () => {
    const { deps, notifyModerators, log } = fakes(video);
    notifyModerators.mockRejectedValueOnce(new Error("db down"));
    await expect(
      reportPost(deps, {
        postId: 5,
        reporterId: "r1",
        reason: "spam",
        note: "",
        viewer: member,
      }),
    ).resolves.toEqual({ hidden: true });
    expect(log).toHaveBeenCalledWith(
      "[feed.reportPost] moderator notification failed",
      expect.objectContaining({ postId: 5 }),
    );
  });
});

describe("after a moderator restores a post", () => {
  const restored = { ...video, hiddenAt: null, reportCount: 0 };

  it("the same reporter can't report it again: the duplicate check sees dismissed reports too", async () => {
    const { deps, payload } = fakes(restored, {
      existing: [{ id: 1, reporterId: "r1", dismissedAt: NOW.toISOString() }],
    });
    await expect(
      reportPost(deps, {
        postId: 5,
        reporterId: "r1",
        reason: "spam",
        note: "",
        viewer: member,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(payload.find).toHaveBeenCalledWith({
      collection: "post-reports",
      where: {
        and: [{ post: { equals: 5 } }, { reporterId: { equals: "r1" } }],
      },
      limit: 1,
      depth: 0,
    });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("a different member can report it, which hides it again and counts only open reports", async () => {
    const { deps, payload, notifyModerators } = fakes(restored, {
      reportTotal: 1,
    });
    await expect(
      reportPost(deps, {
        postId: 5,
        reporterId: "r3",
        reason: "inappropriate",
        note: "",
        viewer: { ...member, userId: "r3" },
      }),
    ).resolves.toEqual({ hidden: true });
    expect(payload.count).toHaveBeenCalledWith({
      collection: "post-reports",
      where: OPEN_REPORTS,
    });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "feed-posts",
      id: 5,
      data: { hiddenAt: NOW.toISOString(), reportCount: 1 },
    });
    expect(notifyModerators).toHaveBeenCalledWith({
      communityId: "c1",
      postId: 5,
      isVideo: true,
    });
  });
});

describe("reviewReport", () => {
  it("restore shows the post again and dismisses its open reports, keeping the rows", async () => {
    const { deps, payload, getStorage } = fakes({
      ...video,
      hiddenAt: NOW.toISOString(),
      reportCount: 2,
    });
    await reviewReport(deps, { postId: 5, action: "restore" });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "post-reports",
      where: OPEN_REPORTS,
      data: { dismissedAt: NOW.toISOString() },
    });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "feed-posts",
      id: 5,
      data: { hiddenAt: null, reportCount: 0 },
    });
    expect(payload.delete).not.toHaveBeenCalled();
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("remove deletes the post, its files, and its reports", async () => {
    const { deps, payload, storage } = fakes({
      ...video,
      hiddenAt: NOW.toISOString(),
    });
    await reviewReport(deps, { postId: 5, action: "remove" });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "feed-posts",
      id: 5,
      data: { isDeleted: true, content: "", authorName: "", imageUrl: null },
    });
    expect(storage.remove).toHaveBeenCalledWith(["k.mp4", "k.jpg"]);
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "post-reports",
      where: { post: { equals: 5 } },
    });
  });

  it("remove still succeeds when storage is unreachable, and never needs storage for a text post", async () => {
    const broken = fakes({ ...video, hiddenAt: NOW.toISOString() });
    broken.getStorage.mockImplementation(() => {
      throw new Error("S3 not configured");
    });
    await expect(
      reviewReport(broken.deps, { postId: 5, action: "remove" }),
    ).resolves.toBeUndefined();
    expect(broken.log).toHaveBeenCalledWith(
      "[feed.reviewReport] video cleanup failed",
      expect.objectContaining({ postId: 5 }),
    );
    expect(broken.payload.delete).toHaveBeenCalledWith({
      collection: "post-reports",
      where: { post: { equals: 5 } },
    });

    const text = fakes({ ...video, video: null, hiddenAt: NOW.toISOString() });
    await reviewReport(text.deps, { postId: 5, action: "remove" });
    expect(text.getStorage).not.toHaveBeenCalled();
  });

  it("reviewing a post its author already deleted clears its reports and says not found", async () => {
    const { deps, payload } = fakes({ ...video, isDeleted: true });
    await expect(
      reviewReport(deps, { postId: 5, action: "restore" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "post-reports",
      where: { post: { equals: 5 } },
    });
  });
});

describe("listPostReports", () => {
  it("returns open reports' reasons and notes newest first, without who reported", async () => {
    const { payload } = fakes(video);
    payload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 2,
          reporterId: "r2",
          reason: "other",
          note: "Stolen clip",
          createdAt: "2026-09-24T11:00:00.000Z",
        },
        {
          id: 1,
          reporterId: "r1",
          reason: "spam",
          note: null,
          createdAt: "2026-09-24T10:00:00.000Z",
        },
      ],
    });
    await expect(listPostReports(payload as never, 5)).resolves.toEqual([
      {
        reason: "other",
        note: "Stolen clip",
        createdAt: "2026-09-24T11:00:00.000Z",
      },
      { reason: "spam", note: null, createdAt: "2026-09-24T10:00:00.000Z" },
    ]);
    expect(payload.find).toHaveBeenCalledWith({
      collection: "post-reports",
      where: OPEN_REPORTS,
      sort: "-createdAt",
      pagination: false,
      depth: 0,
    });
  });
});
