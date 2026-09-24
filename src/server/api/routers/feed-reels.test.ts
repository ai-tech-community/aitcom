// Router-level tests for feed.getReels: who the caller is decides what they see.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as FeedPosts from "@/server/communities/feed-posts";

const hooks = {
  community: { id: "c-1" } as { id: string } | undefined,
  membership: undefined as { role: string } | undefined,
  membershipLookups: 0,
  post: null as Record<string, unknown> | null,
};

const payload = {
  findByID: vi.fn(),
  find: vi.fn(),
};

vi.mock("@/server/db", () => ({
  db: {
    query: {
      communityMemberships: {
        findFirst: async () => {
          hooks.membershipLookups += 1;
          return hooks.membership;
        },
      },
      communities: { findFirst: async () => hooks.community },
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
vi.mock("@/server/communities/feed-posts", async (importOriginal) => ({
  ...(await importOriginal<typeof FeedPosts>()),
  decorateFeedPosts: vi.fn(async (_db, _p, posts: object[]) =>
    posts.map((p) => ({ ...p })),
  ),
}));

import { createCaller } from "@/server/api/root";
import { db as mockedDb } from "@/server/db";
import { decorateFeedPosts } from "@/server/communities/feed-posts";
import { getVideoStorage } from "@/server/media/video-storage";

function caller(userId: string | null) {
  return createCaller({
    db: mockedDb,
    session: userId ? ({ user: { id: userId } } as never) : null,
    headers: new Headers(),
  });
}

const hiddenVideo = {
  id: 7,
  authorId: "a-1",
  communityId: "c-1",
  createdAt: "2026-09-24T12:00:00.000Z",
  visibility: "public",
  hiddenAt: "2026-09-24T13:00:00.000Z",
  isDeleted: false,
  video: { key: "7.mp4" },
};

beforeEach(() => {
  vi.clearAllMocks();
  hooks.community = { id: "c-1" };
  hooks.membership = undefined;
  hooks.membershipLookups = 0;
  hooks.post = hiddenVideo;
  payload.findByID.mockImplementation(async () => {
    if (!hooks.post) throw new Error("nf");
    return hooks.post;
  });
  payload.find.mockResolvedValue({ docs: [] });
});

describe("feed.getReels", () => {
  it("lets a signed-out visitor browse public videos only", async () => {
    const page = await caller(null).feed.getReels({ communitySlug: "town" });
    expect(page).toEqual({ items: [], nextCursor: null, notice: null });
    expect(hooks.membershipLookups).toBe(0);
    const where = JSON.stringify(payload.find.mock.calls[0]![0].where);
    expect(where).toContain('"visibility":{"equals":"public"}');
    expect(where).toContain('"hiddenAt":{"exists":false}');
  });

  it("never shows a visitor a reported public video from a deep link", async () => {
    const page = await caller(null).feed.getReels({
      communitySlug: "town",
      startAtPostId: 7,
    });
    expect(page).toEqual({
      items: [],
      nextCursor: null,
      notice: "unavailable",
    });
    expect(decorateFeedPosts).not.toHaveBeenCalled();
  });

  it("shows a moderator the reported video from a deep link", async () => {
    hooks.membership = { role: "moderator" };
    const page = await caller("mod-1").feed.getReels({
      communitySlug: "town",
      startAtPostId: 7,
    });
    expect(page.notice).toBeNull();
    expect(page.items.map((p) => p.id)).toEqual([7]);
    const call = vi.mocked(decorateFeedPosts).mock.calls[0]!;
    expect(call[3]).toBe("mod-1");
    // Storage is handed over lazily, not reached for up front.
    expect(call[4]).toBe(getVideoStorage);
  });

  it("gives a signed-in non-member the visitor's view", async () => {
    const page = await caller("u-1").feed.getReels({
      communitySlug: "town",
      startAtPostId: 7,
    });
    expect(hooks.membershipLookups).toBe(1);
    expect(page.notice).toBe("unavailable");
  });

  it("says not found for an unknown community", async () => {
    hooks.community = undefined;
    await expect(
      caller(null).feed.getReels({ communitySlug: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a garbage cursor or a fractional limit", async () => {
    await expect(
      caller(null).feed.getReels({
        communitySlug: "town",
        cursor: { createdAt: "not a date", id: 3 },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller(null).feed.getReels({ communitySlug: "town", limit: 2.5 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(payload.find).not.toHaveBeenCalled();
  });
});
