import { describe, expect, it } from "vitest";

import {
  compareActivity,
  groupAdjacentJoins,
  mergeActivityPage,
  type ActivityEntry,
  type ActivityKind,
} from "./community-activity";

function entry(kind: ActivityKind, id: string, at: string): ActivityEntry {
  return { kind, id, at, data: { id } };
}

describe("mergeActivityPage", () => {
  const posts = [
    entry("post", "3", "2026-09-23T12:00:00.000Z"),
    entry("post", "1", "2026-09-20T12:00:00.000Z"),
  ];
  const threads = [
    entry("thread", "9", "2026-09-22T12:00:00.000Z"),
    entry("thread", "8", "2026-09-19T12:00:00.000Z"),
  ];
  const joins = [entry("join", "u1", "2026-09-21T12:00:00.000Z")];

  it("orders every source newest first", () => {
    const { entries } = mergeActivityPage([posts, threads, joins], null, 10);
    expect(entries.map((e) => `${e.kind}:${e.id}`)).toEqual([
      "post:3",
      "thread:9",
      "join:u1",
      "post:1",
      "thread:8",
    ]);
  });

  it("pages with an exclusive cursor that never repeats or skips a row", () => {
    const first = mergeActivityPage([posts, threads, joins], null, 2);
    expect(first.entries.map((e) => e.id)).toEqual(["3", "9"]);
    expect(first.nextCursor).toEqual({
      at: "2026-09-22T12:00:00.000Z",
      key: "thread:9",
    });
    const second = mergeActivityPage(
      [posts, threads, joins],
      first.nextCursor,
      2,
    );
    expect(second.entries.map((e) => e.id)).toEqual(["u1", "1"]);
    const third = mergeActivityPage(
      [posts, threads, joins],
      second.nextCursor,
      2,
    );
    expect(third.entries.map((e) => e.id)).toEqual(["8"]);
    expect(third.nextCursor).toBeNull();
  });

  it("breaks ties on the same instant by key, across pages", () => {
    const at = "2026-09-23T12:00:00.000Z";
    const tied = [
      entry("post", "1", at),
      entry("thread", "1", at),
      entry("idea", "1", at),
    ];
    const first = mergeActivityPage([tied], null, 1);
    const second = mergeActivityPage([tied], first.nextCursor, 1);
    const third = mergeActivityPage([tied], second.nextCursor, 1);
    const seen = [first, second, third].flatMap((page) =>
      page.entries.map((e) => `${e.kind}:${e.id}`),
    );
    expect(new Set(seen).size).toBe(3);
    expect(third.nextCursor).toBeNull();
  });

  it("returns no cursor when everything fits", () => {
    expect(mergeActivityPage([posts], null, 5).nextCursor).toBeNull();
  });
});

describe("compareActivity", () => {
  it("puts newer first", () => {
    expect(
      compareActivity(
        { at: "2026-09-23T00:00:00.000Z", key: "a" },
        { at: "2026-09-22T00:00:00.000Z", key: "a" },
      ),
    ).toBeLessThan(0);
  });
});

describe("groupAdjacentJoins", () => {
  it("folds neighbouring joins and keeps other kinds in place", () => {
    const groups = groupAdjacentJoins<{ id: string }>([
      entry("join", "a", "2026-09-23T03:00:00.000Z"),
      entry("join", "b", "2026-09-23T02:00:00.000Z"),
      entry("post", "1", "2026-09-23T01:00:00.000Z"),
      entry("join", "c", "2026-09-23T00:00:00.000Z"),
    ]);
    expect(
      groups.map((group) =>
        group.kind === "joins"
          ? `joins:${group.members.map((m) => m.id).join(",")}`
          : `${group.entry.kind}:${group.entry.id}`,
      ),
    ).toEqual(["joins:a,b", "post:1", "joins:c"]);
  });
});
