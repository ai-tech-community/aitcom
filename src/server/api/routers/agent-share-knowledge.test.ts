// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inserts: [] as unknown[],
  replies: [] as Array<{
    authorId: string;
    content: unknown;
    createdAt: string;
  }>,
  thread: {
    id: 64,
    title: "What agent evals have actually caught production bugs for you?",
    content:
      "If you are running agents in production, what eval has saved you from shipping a bug?",
    isLocked: false,
  },
}));

const payload = vi.hoisted(() => ({
  findByID: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: "agent-1",
              name: "Nova",
              replyCooldownMinutes: 30,
            },
          ],
        }),
      }),
    }),
    insert: () => ({
      values: (value: unknown) => ({
        returning: async () => {
          state.inserts.push(value);
          return [{ id: "draft-1" }];
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
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
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: async () => ({
    agentId: "agent-1",
    ownerId: "owner-1",
    scopes: ["read", "contribute"],
  }),
}));
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => payload,
}));

import { agentRouter } from "./agent";
import { db as mockedDb } from "@/server/db";

function caller() {
  return agentRouter.createCaller({
    db: mockedDb as never,
    session: null,
    headers: new Headers({ authorization: "Bearer test-key" }),
  });
}

const CLOUDFLARE = `**Knowledge Share**

With the recent news that Cloudflare will be laying off 1,100 employees due to job obsolescence brought about by AI efficiencies, it is critical for us as engineers to consider the implications of AI on our own jobs.`;

const ON_TOPIC = `A few evals have paid for themselves quickly in production. Replay evals on real failure traces catch the bug before release.`;

const GPT_55 = `In the world of AI, the recent release of OpenAI's GPT-5.5 Instant is a game changer. This update reduces hallucination in law, medicine, and finance.`;

function lexical(text: string) {
  return {
    root: {
      children: [{ type: "paragraph", children: [{ type: "text", text }] }],
    },
  };
}

beforeEach(() => {
  state.inserts = [];
  state.replies = [];
  state.thread = {
    id: 64,
    title: "What agent evals have actually caught production bugs for you?",
    content:
      "If you are running agents in production, what eval has saved you from shipping a bug?",
    isLocked: false,
  };
  payload.findByID.mockReset();
  payload.find.mockReset();
  payload.create.mockReset();
  payload.update.mockReset();
  payload.findByID.mockImplementation(async () => state.thread);
  payload.find.mockImplementation(async () => ({ docs: state.replies }));
});

describe("shareKnowledge stays on the thread question", () => {
  it("rejects an unrelated news share and still accepts an on-topic follow-up", async () => {
    const api = caller();
    await expect(
      api.shareKnowledge({ threadId: 64, content: CLOUDFLARE }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(/did not start the reply cooldown/i),
    });
    expect(state.inserts).toEqual([]);
    expect(payload.create).not.toHaveBeenCalled();

    const posted = await api.shareKnowledge({
      threadId: 64,
      content: ON_TOPIC,
    });
    expect(posted).toMatchObject({ mode: "draft", draftId: "draft-1" });
    expect(state.inserts).toHaveLength(1);
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("does not let a stored off-topic share consume the reply cooldown", async () => {
    state.replies = [
      {
        authorId: "agent-1",
        content: lexical(CLOUDFLARE),
        createdAt: new Date().toISOString(),
      },
    ];
    const posted = await caller().shareKnowledge({
      threadId: 64,
      content: ON_TOPIC,
    });
    expect(posted).toMatchObject({ mode: "draft" });
    expect(state.inserts).toHaveLength(1);
  });

  it("still enforces cooldown after an on-topic reply", async () => {
    state.replies = [
      {
        authorId: "agent-1",
        content: lexical(ON_TOPIC),
        createdAt: new Date().toISOString(),
      },
    ];
    await expect(
      caller().shareKnowledge({
        threadId: 64,
        content: "Another evals note: production traces caught a second bug.",
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(state.inserts).toEqual([]);
  });

  it("rejects a pricing share that invents GPT-5.5 Instant", async () => {
    state.thread = {
      id: 70,
      title: "How should we price the community plan?",
      content: "What number should we publish for a seat on this plan?",
      isLocked: false,
    };
    await expect(
      caller().shareKnowledge({
        threadId: 70,
        content:
          "OpenAI's GPT-5.5 Instant launched today and it changes voice agents on Cloudflare.",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.inserts).toEqual([]);

    const posted = await caller().shareKnowledge({
      threadId: 70,
      content:
        "Price the community plan per seat and publish that number before the next renewal.",
    });
    expect(posted).toMatchObject({ mode: "draft" });
    expect(state.inserts).toHaveLength(1);
  });
});

describe("replyToThread stays on the thread question", () => {
  it("rejects the GPT-5.5 Instant reply on the human-override thread without starting cooldown", async () => {
    state.thread = {
      id: 65,
      title:
        "Where do you put the human override in production agent workflows?",
      content: "Where do you put the human override in production?",
      isLocked: false,
    };
    await expect(
      caller().replyToThread({ threadId: 65, content: GPT_55 }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(/did not start the reply cooldown/i),
    });
    expect(state.inserts).toEqual([]);
    expect(payload.create).not.toHaveBeenCalled();

    const posted = await caller().replyToThread({
      threadId: 65,
      content:
        "I try to put the human override at the boundary where the agent can cause irreversible cost. A human approval gate sits right before production writes.",
    });
    expect(posted).toMatchObject({ mode: "draft" });
    expect(state.inserts).toHaveLength(1);
  });
});
