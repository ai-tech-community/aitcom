// Router-level tests for the report/moderation gates in the feed router.
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = {
  membership: undefined as { role: string } | undefined,
  post: null as Record<string, unknown> | null,
  community: undefined as { slug: string; name: string } | undefined,
  moderators: [] as { userId: string }[],
  inserted: [] as unknown[],
};

const payload = {
  findByID: vi.fn(),
  find: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/server/db", () => ({
  db: {
    query: {
      communityMemberships: { findFirst: async () => hooks.membership },
      communities: { findFirst: async () => hooks.community },
    },
    select: () => ({
      from: () => ({ where: async () => hooks.moderators }),
    }),
    insert: () => ({
      values: async (rows: unknown[]) => {
        hooks.inserted.push(...rows);
      },
    }),
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

import { createCaller } from "@/server/api/root";
import { db as mockedDb } from "@/server/db";

function caller(userId = "u-1") {
  return createCaller({
    db: mockedDb,
    session: { user: { id: userId } } as never,
    headers: new Headers(),
  });
}

const communityPost = (over: Record<string, unknown> = {}) => ({
  id: 5,
  authorId: "a-1",
  communityId: "c-1",
  visibility: "community",
  hiddenAt: "2026-09-24T12:00:00.000Z",
  reportCount: 1,
  isDeleted: false,
  video: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  hooks.membership = undefined;
  hooks.community = undefined;
  hooks.moderators = [];
  hooks.inserted = [];
  hooks.post = communityPost();
  payload.findByID.mockImplementation(async () => {
    if (!hooks.post) throw Object.assign(new Error("nf"), { status: 404 });
    return hooks.post;
  });
  payload.find.mockResolvedValue({ docs: [] });
  payload.update.mockResolvedValue({});
  payload.delete.mockResolvedValue({});
});

describe("feed.reviewReport", () => {
  it("refuses a plain member and changes nothing", async () => {
    hooks.membership = { role: "member" };
    await expect(
      caller().feed.reviewReport({ postId: 5, action: "restore" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(payload.update).not.toHaveBeenCalled();
    expect(payload.delete).not.toHaveBeenCalled();
  });

  it("refuses someone who isn't a member at all", async () => {
    await expect(
      caller().feed.reviewReport({ postId: 5, action: "remove" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("lets a moderator restore the post", async () => {
    hooks.membership = { role: "moderator" };
    await expect(
      caller().feed.reviewReport({ postId: 5, action: "restore" }),
    ).resolves.toEqual({ ok: true });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "feed-posts",
      id: 5,
      data: { hiddenAt: null, reportCount: 0 },
    });
  });
});

describe("feed.getPostReports", () => {
  it("refuses a plain member", async () => {
    hooks.membership = { role: "member" };
    await expect(
      caller().feed.getPostReports({ postId: 5 }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(payload.find).not.toHaveBeenCalled();
  });

  it("refuses a plain member before saying whether the post was deleted", async () => {
    hooks.membership = { role: "member" };
    hooks.post = communityPost({ isDeleted: true });
    await expect(
      caller().feed.getPostReports({ postId: 5 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("says not found for a deleted or missing post", async () => {
    hooks.membership = { role: "admin" };
    hooks.post = communityPost({ isDeleted: true });
    await expect(
      caller().feed.getPostReports({ postId: 5 }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    hooks.post = null;
    await expect(
      caller().feed.getPostReports({ postId: 5 }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(payload.find).not.toHaveBeenCalled();
  });

  it("gives an owner the open reports", async () => {
    hooks.membership = { role: "owner" };
    payload.find.mockResolvedValueOnce({
      docs: [
        { reason: "spam", note: null, createdAt: "2026-09-24T12:00:00.000Z" },
      ],
    });
    await expect(caller().feed.getPostReports({ postId: 5 })).resolves.toEqual([
      { reason: "spam", note: null, createdAt: "2026-09-24T12:00:00.000Z" },
    ]);
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "post-reports",
        where: {
          and: [{ post: { equals: 5 } }, { dismissedAt: { exists: false } }],
        },
      }),
    );
  });
});

describe("feed.reportPost moderator notice", () => {
  beforeEach(() => {
    hooks.membership = { role: "member" };
    hooks.community = { slug: "makers", name: "Makers" };
    hooks.moderators = [{ userId: "mod-1" }];
    payload.count.mockResolvedValue({ totalDocs: 1 });
    payload.create.mockResolvedValue({});
  });

  it("links a reported video to its reel", async () => {
    hooks.post = communityPost({
      hiddenAt: null,
      reportCount: 0,
      video: { key: "k.mp4", thumbnailKey: "k.jpg" },
    });
    await caller().feed.reportPost({ postId: 5, reason: "spam" });
    expect(hooks.inserted).toEqual([
      expect.objectContaining({
        userId: "mod-1",
        type: "post_reported",
        metadata: { postId: 5, path: "/communities/makers/reels?v=5" },
      }),
    ]);
    expect((hooks.inserted[0] as { content: string }).content).toContain(
      "(/communities/makers/reels?v=5)",
    );
  });

  it("links a reported text post to the community page", async () => {
    hooks.post = communityPost({ hiddenAt: null, reportCount: 0 });
    await caller().feed.reportPost({ postId: 5, reason: "spam" });
    expect(hooks.inserted).toEqual([
      expect.objectContaining({
        metadata: { postId: 5, path: "/communities/makers" },
      }),
    ]);
  });
});
