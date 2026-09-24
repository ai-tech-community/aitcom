// Router-level tests: likes and comments in the member feed follow the same
// post visibility rule as the feed lists.
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = {
  membership: undefined as { role: string } | undefined,
  post: null as Record<string, unknown> | null,
};

const payload = {
  findByID: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/server/db", () => ({
  db: {
    insert: () => ({ values: async () => undefined }),
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
vi.mock("@/lib/gamification", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gamification")>()),
  awardXp: vi.fn(async () => undefined),
}));
vi.mock("@/server/agent/activity", () => ({
  logActivity: vi.fn(async () => undefined),
}));

import { createCaller } from "@/server/api/root";
import { db as mockedDb } from "@/server/db";

function caller(userId = "u-1") {
  return createCaller({
    db: mockedDb,
    session: { user: { id: userId, name: "Ana" } } as never,
    headers: new Headers(),
  });
}

const post = (over: Record<string, unknown> = {}) => ({
  id: 5,
  authorId: "a-1",
  communityId: "c-1",
  visibility: "community",
  hiddenAt: null,
  isDeleted: false,
  likeCount: 0,
  video: null,
  ...over,
});

const HIDDEN = "2026-09-24T12:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  hooks.membership = undefined;
  hooks.post = post();
  payload.findByID.mockImplementation(async () => {
    if (!hooks.post) throw Object.assign(new Error("nf"), { status: 404 });
    return hooks.post;
  });
  payload.find.mockResolvedValue({ docs: [] });
  payload.create.mockResolvedValue({ id: 9 });
  payload.update.mockResolvedValue({});
});

describe("feed.toggleLike", () => {
  it("says not found when a plain member likes a hidden post", async () => {
    hooks.membership = { role: "member" };
    hooks.post = post({ hiddenAt: HIDDEN });
    await expect(caller().feed.toggleLike({ postId: 5 })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("still refuses a non-member liking a public post", async () => {
    hooks.post = post({ visibility: "public" });
    await expect(caller().feed.toggleLike({ postId: 5 })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
  });

  it("lets a member like a visible post", async () => {
    hooks.membership = { role: "member" };
    await expect(caller().feed.toggleLike({ postId: 5 })).resolves.toEqual({
      liked: true,
    });
  });
});

describe("feed.getComments", () => {
  it("says not found to a non-member reading a community-only post", async () => {
    await expect(
      caller().feed.getComments({ postId: 5 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(payload.find).not.toHaveBeenCalled();
  });

  it("says not found to a plain member reading a hidden post", async () => {
    hooks.membership = { role: "member" };
    hooks.post = post({ hiddenAt: HIDDEN });
    await expect(
      caller().feed.getComments({ postId: 5 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(payload.find).not.toHaveBeenCalled();
  });

  it("gives a member the comments of a visible post", async () => {
    hooks.membership = { role: "member" };
    payload.find.mockResolvedValueOnce({ docs: [{ id: 1, content: "hi" }] });
    await expect(caller().feed.getComments({ postId: 5 })).resolves.toEqual([
      { id: 1, content: "hi" },
    ]);
  });

  it("gives a non-member the comments of a public post", async () => {
    hooks.post = post({ visibility: "public" });
    await expect(caller().feed.getComments({ postId: 5 })).resolves.toEqual([]);
  });

  it("keeps hub-wide posts (no community) readable as before", async () => {
    hooks.post = post({ communityId: null });
    await expect(caller().feed.getComments({ postId: 5 })).resolves.toEqual([]);
  });
});

describe("feed.addComment", () => {
  it("says not found when a plain member comments on someone's hidden post", async () => {
    hooks.membership = { role: "member" };
    hooks.post = post({ hiddenAt: HIDDEN });
    await expect(
      caller().feed.addComment({ postId: 5, content: "hi" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("lets the author comment on their own hidden post", async () => {
    hooks.membership = { role: "member" };
    hooks.post = post({ hiddenAt: HIDDEN, authorId: "u-1" });
    await expect(
      caller().feed.addComment({ postId: 5, content: "hi" }),
    ).resolves.toEqual({ id: 9 });
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "feed-comments" }),
    );
  });

  it("still refuses a non-member commenting on a public post", async () => {
    hooks.post = post({ visibility: "public" });
    await expect(
      caller().feed.addComment({ postId: 5, content: "hi" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
