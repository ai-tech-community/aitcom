import { beforeEach, expect, it, vi } from "vitest";
import { storylineProposalSchema } from "@/lib/news/storyline-suggestions";
import { storyFixture } from "@/test/news-storyline-fixture";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  writes: [] as Array<{ table: unknown; value: Record<string, unknown> }>,
}));
vi.mock("@/server/db", () => {
  const query = (result: () => unknown) => {
    const chain: Record<string, unknown> = {};
    for (const name of [
      "from",
      "where",
      "limit",
      "for",
      "innerJoin",
      "orderBy",
      "offset",
      "returning",
    ])
      chain[name] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => resolve(result());
    return chain;
  };
  const db = {
    select: () => query(() => state.rows.shift() ?? []),
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) =>
        query(() => {
          state.writes.push({ table, value });
          return [{ id: "stored-draft" }];
        }),
    }),
    update: (table: unknown) => ({
      set: (value: Record<string, unknown>) =>
        query(() => {
          state.writes.push({ table, value });
          return state.rows.shift() ?? [];
        }),
    }),
  };
  return {
    db: {
      ...db,
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    },
  };
});
import {
  submitAgentStoryline,
  listAgentStorylineDrafts,
  dismissAgentStorylineDraft,
} from "./agent-storylines";
const proposal = () =>
  storylineProposalSchema.parse({
    ...storyFixture,
    articles: storyFixture.articles,
  });
const articles = storyFixture.articles.map((m) => m.article);
beforeEach(() => {
  state.rows = [];
  state.writes = [];
});
it("stores a pending attributed draft without a model dependency or publishing", async () => {
  state.rows = [[{ id: "agent-a" }], articles, []];
  expect(
    await submitAgentStoryline(
      { agentId: "agent-a", ownerId: "owner-a" },
      proposal(),
    ),
  ).toMatchObject({ mode: "draft", reused: false });
  expect(state.writes[0]?.value).toMatchObject({
    agentId: "agent-a",
    ownerId: "owner-a",
    type: "news_storyline",
    status: "pending",
    metadata: { input: { status: "draft", revision: 0 } },
  });
});
it("rejects unknown or invented evidence before a draft is stored", async () => {
  state.rows = [[{ id: "agent-a" }], articles];
  await expect(
    submitAgentStoryline(
      { agentId: "agent-a", ownerId: "owner-a" },
      {
        ...proposal(),
        articles: proposal().articles.map((m) => ({
          ...m,
          evidence: "Invented evidence from a model",
        })),
      },
    ),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(state.writes).toEqual([]);
});
it("returns the pending duplicate and caps outstanding proposals", async () => {
  const signature = JSON.stringify(
    proposal()
      .articles.map((m) => m.articleId)
      .sort(),
  );
  state.rows = [
    [{ id: "agent-a" }],
    articles,
    [{ id: "existing", metadata: { articleSignature: signature } }],
  ];
  expect(
    await submitAgentStoryline(
      { agentId: "agent-a", ownerId: "owner-a" },
      proposal(),
    ),
  ).toMatchObject({ draftId: "existing", reused: true });
  state.rows = [
    [{ id: "agent-a" }],
    articles,
    Array.from({ length: 10 }, () => ({ id: "other", metadata: {} })),
  ];
  await expect(
    submitAgentStoryline(
      { agentId: "agent-a", ownerId: "owner-a" },
      proposal(),
    ),
  ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  expect(state.writes).toEqual([]);
});
it("revalidates inbox source evidence and reports stale proposals rather than hiding them", async () => {
  const input = { ...proposal(), status: "draft", revision: 0 };
  const draft = {
    id: "d1",
    agentId: "a1",
    ownerId: "o1",
    content: "Story",
    metadata: { input },
    createdAt: new Date(),
  };
  state.rows = [[{ total: 1 }], [{ draft, agentName: "Member bot" }], articles];
  const valid = await listAgentStorylineDrafts(1);
  expect(valid.items[0]?.input).toMatchObject({
    sourceDraftId: "d1",
    status: "draft",
  });
  expect(valid.items[0]?.agentName).toBe("Member bot");
  state.rows = [[{ total: 1 }], [{ draft, agentName: "Member bot" }], []];
  const stale = await listAgentStorylineDrafts(1);
  expect(stale.items).toEqual([]);
  expect(stale.invalidItems).toHaveLength(1);
});
it("dismisses only a pending news draft and refuses an already reviewed proposal", async () => {
  state.rows = [[{ id: "d1" }]];
  expect(await dismissAgentStorylineDraft("d1")).toEqual({ id: "d1" });
  state.rows = [[]];
  await expect(dismissAgentStorylineDraft("d1")).rejects.toMatchObject({
    code: "CONFLICT",
  });
});
