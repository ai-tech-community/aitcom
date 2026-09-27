import { beforeEach, describe, expect, it, vi } from "vitest";

import { syncFeedPostCounters, toggleFeedPostLike } from "./feed-post-counters";

// A tiny in-memory stand-in for the two row collections, so the counts the
// helper stores come from the rows, not from a canned return value.
const rows = {
  likes: [] as { id: number; post: number; userId: string }[],
  comments: [] as { post: number; isDeleted: boolean }[],
};
let nextId = 1;

type Where = { and?: Where[]; [field: string]: unknown };
const conds = (w: Where): Where[] => (w.and ? w.and.flatMap(conds) : [w]);
const matches = (row: Record<string, unknown>, where: Where) =>
  conds(where).every((c) =>
    Object.entries(c).every(([field, op]) => {
      const { equals, not_equals } = op as {
        equals?: unknown;
        not_equals?: unknown;
      };
      if ("equals" in (op as object)) return row[field] === equals;
      return row[field] !== not_equals;
    }),
  );
const table = (collection: string) =>
  (collection === "feed-likes" ? rows.likes : rows.comments) as Record<
    string,
    unknown
  >[];

type Query = { collection: string; where: Where };

const payload = {
  find: vi.fn(async ({ collection, where }: Query) => ({
    docs: table(collection).filter((r) => matches(r, where)),
  })),
  count: vi.fn(async ({ collection, where }: Query) => ({
    totalDocs: table(collection).filter((r) => matches(r, where)).length,
  })),
  create: vi.fn(
    async ({ data }: { data: { post: number; userId: string } }) => {
      const row = { id: nextId++, ...data };
      rows.likes.push(row);
      return row;
    },
  ),
  delete: vi.fn(async ({ id }: { id: number }) => {
    rows.likes = rows.likes.filter((r) => r.id !== id);
  }),
  update: vi.fn(async () => ({})),
};
const p = payload as never;

beforeEach(() => {
  vi.clearAllMocks();
  rows.likes = [];
  rows.comments = [];
  nextId = 1;
});

describe("syncFeedPostCounters", () => {
  it("stores the counts of this post's likes and live comments", async () => {
    rows.likes.push(
      { id: 90, post: 5, userId: "a" },
      { id: 91, post: 5, userId: "b" },
      { id: 92, post: 6, userId: "a" },
    );
    rows.comments.push(
      { post: 5, isDeleted: false },
      { post: 5, isDeleted: true },
      { post: 6, isDeleted: false },
    );

    await expect(syncFeedPostCounters(p, 5)).resolves.toEqual({
      likeCount: 2,
      commentCount: 1,
    });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "feed-posts",
      id: 5,
      data: { likeCount: 2, commentCount: 1 },
    });
  });
});

describe("toggleFeedPostLike", () => {
  it("adds a like and stores the recounted total", async () => {
    rows.likes.push({ id: 90, post: 5, userId: "other" });

    await expect(toggleFeedPostLike(p, 5, "u-1")).resolves.toEqual({
      liked: true,
      likeCount: 2,
    });
    expect(payload.create).toHaveBeenCalledWith({
      collection: "feed-likes",
      data: { post: 5, userId: "u-1" },
    });
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "feed-posts",
        id: 5,
        data: expect.objectContaining({ likeCount: 2 }),
      }),
    );
  });

  it("removes the user's existing like and stores the recounted total", async () => {
    rows.likes.push(
      { id: 90, post: 5, userId: "u-1" },
      { id: 91, post: 5, userId: "other" },
    );

    await expect(toggleFeedPostLike(p, 5, "u-1")).resolves.toEqual({
      liked: false,
      likeCount: 1,
    });
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "feed-likes",
      id: 90,
    });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("heals a stale stored count instead of adding one to it", async () => {
    // The post row may say anything; only the like rows decide the count.
    rows.likes.push(
      { id: 90, post: 5, userId: "a" },
      { id: 91, post: 5, userId: "b" },
    );

    await toggleFeedPostLike(p, 5, "u-1");

    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ likeCount: 3 }),
      }),
    );
  });
});
