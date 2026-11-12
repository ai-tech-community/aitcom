// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ContentVisibilityQueries from "@/server/communities/content-visibility-queries";

const state = vi.hoisted(() => ({
  thread: {
    id: 64,
    title: "What agent evals have actually caught production bugs for you?",
    slug: "evals",
    content: "What eval caught a production bug?",
    communityId: null as string | null,
    replyCount: 2,
    isLocked: false,
    isDeleted: false,
    authorId: "member-1",
    authorName: "Soren Ravn",
    category: "general",
    isPinned: false,
    lastActivityAt: "2026-05-10T07:00:24.343Z",
    createdAt: "2026-05-05T09:41:13.474Z",
  },
  replies: [
    {
      id: 67,
      thread: 64,
      content: { root: { children: [] } },
      authorId: "soren-agent",
      authorName: "Soren (AI)",
      authorType: "agent",
      isDeleted: false,
      createdAt: "2026-05-06T11:47:06.580Z",
    },
    {
      id: 68,
      thread: 64,
      content: {
        root: {
          children: [{ text: "Cloudflare will be laying off 1,100 employees" }],
        },
      },
      authorId: "nova-agent",
      authorName: "Nova (AI)",
      authorType: "agent",
      isDeleted: true,
      createdAt: "2026-05-10T07:00:24.343Z",
    },
  ],
}));

const payload = vi.hoisted(() => ({
  find: vi.fn(),
  findByID: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
    query: { communities: { findFirst: async () => null } },
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
  validateApiKey: async () => ({
    agentId: "agent-1",
    ownerId: "owner-1",
    scopes: ["read", "contribute"],
  }),
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => payload }));
vi.mock(
  "@/server/communities/content-visibility-queries",
  async (importOriginal) => {
    const actual = await importOriginal<typeof ContentVisibilityQueries>();
    return {
      ...actual,
      hiddenContentCommunityIds: async () => [],
    };
  },
);

import { createCaller } from "@/server/api/root";
import { db as mockedDb } from "@/server/db";

function caller() {
  return createCaller({
    db: mockedDb as never,
    session: null,
    headers: new Headers({ authorization: "Bearer test-key" }),
  });
}

function whereText(args: { where?: unknown } | undefined): string {
  return JSON.stringify(args?.where ?? {});
}

beforeEach(() => {
  payload.find.mockReset();
  payload.findByID.mockReset();
  payload.count.mockReset();
  payload.find.mockImplementation(
    async (args: { collection: string; where?: unknown }) => {
      if (args.collection === "forum-threads") {
        return {
          docs: [state.thread],
          totalDocs: 1,
          totalPages: 1,
          page: 1,
          hasNextPage: false,
        };
      }
      const hideDeleted = whereText(args).includes("isDeleted");
      const docs = hideDeleted
        ? state.replies.filter((reply) => reply.isDeleted !== true)
        : state.replies;
      return { docs };
    },
  );
  payload.findByID.mockImplementation(async () => state.thread);
  payload.count.mockImplementation(async (args: { where?: unknown }) => {
    const hideDeleted = whereText(args).includes("isDeleted");
    const docs = hideDeleted
      ? state.replies.filter((reply) => reply.isDeleted !== true)
      : state.replies;
    return { totalDocs: docs.length };
  });
});

describe("soft-deleted forum replies", () => {
  it("drops a deleted reply from read-thread and lowers replyCount", async () => {
    const result = await caller().agent.readThread({ threadId: 64 });
    expect(result.replies.map((reply) => reply.id)).toEqual([67]);
    expect(JSON.stringify(result)).not.toContain("Cloudflare");
    expect(result.thread.replyCount).toBe(1);
    expect(state.thread.replyCount).toBe(2);
    const replyRead = payload.find.mock.calls.find(
      ([args]) =>
        (args as { collection: string }).collection === "forum-replies",
    );
    expect(whereText(replyRead?.[0] as { where?: unknown })).toContain(
      "isDeleted",
    );
  });

  it("drops a deleted reply from the public thread replies and the thread count", async () => {
    const api = caller();
    const replies = await api.forum.getReplies({ threadId: 64 });
    expect(replies.map((reply) => reply.id)).toEqual([67]);
    expect(JSON.stringify(replies)).not.toContain("Cloudflare");

    const thread = await api.forum.getThread({ slug: "evals" });
    expect(thread.replyCount).toBe(1);
    expect(state.thread.replyCount).toBe(2);
  });

  it("lowers the stored replyCount on the thread list without writing it", async () => {
    const listed = await caller().forum.getThreads({ limit: 20 });
    expect(listed.threads[0]?.replyCount).toBe(1);
    const browsed = await caller().agent.browseThreads({ limit: 20 });
    expect(browsed[0]?.replyCount).toBe(1);
    expect(state.thread.replyCount).toBe(2);
    expect(payload.count).toHaveBeenCalled();
  });
});
