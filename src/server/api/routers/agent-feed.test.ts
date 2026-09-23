// Router-level tests: the agent API applies the same post visibility rule as
// the member feed, seen through the agent owner's membership.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { postVisibilityWhere } from "@/server/communities/post-visibility";

const hooks = {
  agent: { agentId: "agent-1", ownerId: "owner-1" as string | null, scopes: ["read", "contribute"] },
  membership: undefined as { role: string } | undefined,
  membershipLookups: 0,
  post: null as Record<string, unknown> | null,
};

const payload = {
  findByID: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = () => chain;
  chain.where = () => Promise.resolve();
  return chain;
}

vi.mock("@/server/db", () => ({
  db: {
    update: () => makeUpdateChain(),
    insert: () => ({
      values: () => ({ returning: async () => [{ id: "row-1" }] }),
    }),
    query: {
      communityMemberships: {
        findFirst: async () => {
          hooks.membershipLookups += 1;
          return hooks.membership;
        },
      },
      communities: {
        findFirst: async () => ({
          id: "c-1",
          slug: "makers",
          name: "Makers",
          feedPostPolicy: "all_members",
          deletedAt: null,
        }),
      },
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
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: async () => hooks.agent,
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => payload }));

import { createCaller } from "@/server/api/root";
import { db as mockedDb } from "@/server/db";

function agentCaller() {
  return createCaller({
    db: mockedDb,
    session: null,
    headers: new Headers({ authorization: "Bearer test-key" }),
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
  content: "Hello",
  ...over,
});

/** The visibility clause browseFeed put in its payload.find where. */
function browseWhere() {
  const call = payload.find.mock.calls.find(
    ([args]) => (args as { collection: string }).collection === "feed-posts",
  );
  return (call?.[0] as { where: { and: unknown[] } }).where;
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.agent = { agentId: "agent-1", ownerId: "owner-1", scopes: ["read", "contribute"] };
  hooks.membership = undefined;
  hooks.membershipLookups = 0;
  hooks.post = post();
  payload.findByID.mockImplementation(async () => {
    if (!hooks.post) throw Object.assign(new Error("nf"), { status: 404 });
    return hooks.post;
  });
  payload.find.mockResolvedValue({ docs: [] });
  payload.create.mockResolvedValue({});
  payload.update.mockResolvedValue({});
});

describe("agent.browseFeed", () => {
  it("filters with the owner's view: a plain member sees their own hidden posts, not others'", async () => {
    hooks.membership = { role: "member" };
    await agentCaller().agent.browseFeed({ communitySlug: "makers" });
    expect(browseWhere()).toEqual({
      and: [
        { communityId: { equals: "c-1" } },
        postVisibilityWhere({ userId: "owner-1", isMember: true, isModerator: false }),
      ],
    });
  });

  it("gives a moderator owner the moderator view", async () => {
    hooks.membership = { role: "moderator" };
    await agentCaller().agent.browseFeed({ communitySlug: "makers" });
    expect(browseWhere().and[1]).toEqual(
      postVisibilityWhere({ userId: "owner-1", isMember: true, isModerator: true }),
    );
  });

  it("shows a non-member owner's agent public posts only", async () => {
    await agentCaller().agent.browseFeed({ communitySlug: "makers" });
    expect(browseWhere().and[1]).toEqual(
      postVisibilityWhere({ userId: "owner-1", isMember: false, isModerator: false }),
    );
    expect(JSON.stringify(browseWhere())).toContain('"visibility":{"equals":"public"}');
  });

  it("lets an unclaimed agent browse as an outsider instead of refusing it", async () => {
    hooks.agent = { ...hooks.agent, ownerId: null };
    await expect(
      agentCaller().agent.browseFeed({ communitySlug: "makers" }),
    ).resolves.toEqual({ posts: [], nextCursor: undefined });
    expect(browseWhere().and[1]).toEqual(
      postVisibilityWhere({ userId: null, isMember: false, isModerator: false }),
    );
    expect(hooks.membershipLookups).toBe(0);
  });
});

describe("agent.toggleFeedLike", () => {
  it("says not found for a hidden post when the owner is a plain member", async () => {
    hooks.membership = { role: "member" };
    hooks.post = post({ hiddenAt: "2026-09-24T12:00:00.000Z" });
    await expect(
      agentCaller().agent.toggleFeedLike({ postId: 5 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Post not found" });
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("still likes a visible post", async () => {
    hooks.membership = { role: "member" };
    await expect(agentCaller().agent.toggleFeedLike({ postId: 5 })).resolves.toEqual({
      liked: true,
    });
  });
});

describe("agent.getFeedComments", () => {
  const comment = { id: 9, content: "Nice", authorId: "m-1", authorName: "M", createdAt: "2026-09-24T12:00:00.000Z" };

  it("says not found for a community-only post the owner can't see", async () => {
    await expect(
      agentCaller().agent.getFeedComments({ postId: 5 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Post not found" });
    expect(payload.find).not.toHaveBeenCalled();
  });

  it("says not found for a hidden post when the owner is a plain member", async () => {
    hooks.membership = { role: "member" };
    hooks.post = post({ hiddenAt: "2026-09-24T12:00:00.000Z" });
    await expect(
      agentCaller().agent.getFeedComments({ postId: 5 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets an unclaimed agent read a public post's comments", async () => {
    hooks.agent = { ...hooks.agent, ownerId: null };
    hooks.post = post({ visibility: "public" });
    payload.find.mockResolvedValueOnce({ docs: [comment] });
    await expect(agentCaller().agent.getFeedComments({ postId: 5 })).resolves.toEqual([
      { id: 9, content: "Nice", authorId: "m-1", authorName: "M", createdAt: comment.createdAt },
    ]);
  });

  it("keeps hub-wide posts (no community) readable as before", async () => {
    hooks.post = post({ communityId: null });
    payload.find.mockResolvedValueOnce({ docs: [comment] });
    await expect(agentCaller().agent.getFeedComments({ postId: 5 })).resolves.toHaveLength(1);
    expect(hooks.membershipLookups).toBe(0);
  });
});
