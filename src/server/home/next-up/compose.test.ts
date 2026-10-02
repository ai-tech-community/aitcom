// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { composeNextUp } from "./compose";
import type { NextUpContext, NextUpItem, NextUpLoader } from "./types";

const ctx = {
  userId: "u1",
  locale: "en",
  now: new Date("2026-10-02T10:00:00.000Z"),
} as NextUpContext;

function event(key: string, at: string): NextUpItem {
  return {
    kind: "event",
    key,
    urgency: { tier: "timeBound", at },
    eventId: 1,
    slug: key,
    title: key,
    startsAt: at,
    endsAt: null,
    allDay: false,
    happeningNow: false,
    registration: "registered",
  };
}

function challenge(key: string, endsAt: string | null): NextUpItem {
  return {
    kind: "challenge",
    key,
    urgency: endsAt ? { tier: "timeBound", at: endsAt } : { tier: "ongoing" },
    challengeId: 1,
    slug: key,
    title: key,
    endsAt,
  };
}

function invite(key: string): NextUpItem {
  return {
    kind: "invite",
    key,
    urgency: { tier: "actionNeeded" },
    communityId: key,
    slug: key,
    name: key,
  };
}

function joinRequests(key: string): NextUpItem {
  return {
    kind: "joinRequests",
    key,
    urgency: { tier: "actionNeeded" },
    communityId: key,
    slug: key,
    name: key,
    count: 2,
  };
}

const unread: NextUpItem = {
  kind: "unread",
  key: "unread",
  urgency: { tier: "catchUp" },
  notifications: 1,
  messages: 0,
};

function loader(name: string, items: NextUpItem[]): NextUpLoader {
  return { name, load: vi.fn(async () => items) };
}

function failing(
  name: string,
  error = new Error(`${name} down`),
): NextUpLoader {
  return {
    name,
    load: vi.fn(async () => {
      throw error;
    }),
  };
}

const keys = (items: NextUpItem[]) => items.map((i) => i.key);

describe("composeNextUp", () => {
  it("orders time-bound items by soonest first, then action needed, then ongoing, then unread", async () => {
    const result = await composeNextUp(
      [
        loader("unread", [unread]),
        loader("invites", [invite("invite-a")]),
        loader("challenges", [
          challenge("open-ended", null),
          challenge("deadline-mid", "2026-10-05T12:00:00.000Z"),
        ]),
        loader("events", [
          event("event-soon", "2026-10-03T18:00:00.000Z"),
          event("event-late", "2026-10-09T18:00:00.000Z"),
        ]),
        loader("joinRequests", [joinRequests("requests-a")]),
      ],
      ctx,
    );

    expect(keys(result.items)).toEqual([
      "event-soon",
      "deadline-mid",
      "event-late",
      "invite-a",
      "requests-a",
      "open-ended",
      "unread",
    ]);
    expect(result.partial).toBe(false);
  });

  it("keeps loader order inside a tier that has no instant", async () => {
    const result = await composeNextUp(
      [
        loader("invites", [invite("i1"), invite("i2")]),
        loader("joinRequests", [joinRequests("j1")]),
      ],
      ctx,
    );
    expect(keys(result.items)).toEqual(["i1", "i2", "j1"]);
  });

  it("passes the same context to every loader", async () => {
    const a = loader("a", []);
    const b = loader("b", []);
    await composeNextUp([a, b], ctx);
    expect(a.load).toHaveBeenCalledWith(ctx);
    expect(b.load).toHaveBeenCalledWith(ctx);
  });

  it("returns the other loaders' items and flags partial when one fails", async () => {
    const logFailure = vi.fn();
    const error = new Error("payload down");
    const result = await composeNextUp(
      [
        failing("events", error),
        loader("invites", [invite("i1")]),
        loader("unread", [unread]),
      ],
      ctx,
      { logFailure },
    );

    expect(keys(result.items)).toEqual(["i1", "unread"]);
    expect(result.partial).toBe(true);
    expect(logFailure).toHaveBeenCalledTimes(1);
    expect(logFailure).toHaveBeenCalledWith("events", error);
  });

  it("treats a loader that throws synchronously like any other failure", async () => {
    const logFailure = vi.fn();
    const sync: NextUpLoader = {
      name: "sync",
      load: () => {
        throw new Error("boom");
      },
    };
    const result = await composeNextUp(
      [sync, loader("invites", [invite("i1")])],
      ctx,
      { logFailure },
    );
    expect(keys(result.items)).toEqual(["i1"]);
    expect(result.partial).toBe(true);
    expect(logFailure).toHaveBeenCalledWith("sync", expect.any(Error));
  });

  it("fails the read when every loader fails", async () => {
    const first = new Error("first");
    await expect(
      composeNextUp([failing("a", first), failing("b")], ctx, {
        logFailure: vi.fn(),
      }),
    ).rejects.toBe(first);
  });

  it("returns an empty, complete list when nothing is next", async () => {
    const result = await composeNextUp(
      [loader("events", []), loader("unread", [])],
      ctx,
    );
    expect(result).toEqual({ items: [], partial: false });
  });
});
