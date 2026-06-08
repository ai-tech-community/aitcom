import { describe, expect, it } from "vitest";
import { orderPinnedFirst, MAX_PINS } from "./feed-sort";

type P = { id: number; isPinned?: boolean | null; createdAt: string };

describe("orderPinnedFirst", () => {
  it("puts pinned posts before unpinned, preserving inner order", () => {
    const posts: P[] = [
      { id: 1, isPinned: false, createdAt: "2026-06-08T10:00:00Z" },
      { id: 2, isPinned: true, createdAt: "2026-06-08T09:00:00Z" },
      { id: 3, isPinned: false, createdAt: "2026-06-08T08:00:00Z" },
      { id: 4, isPinned: true, createdAt: "2026-06-08T07:00:00Z" },
    ];
    expect(orderPinnedFirst(posts).map((p) => p.id)).toEqual([2, 4, 1, 3]);
  });
  it("leaves an all-unpinned list unchanged", () => {
    const posts: P[] = [
      { id: 1, createdAt: "b" },
      { id: 2, createdAt: "a" },
    ];
    expect(orderPinnedFirst(posts).map((p) => p.id)).toEqual([1, 2]);
  });
});

describe("MAX_PINS", () => {
  it("caps pins at 3", () => {
    expect(MAX_PINS).toBe(3);
  });
});
