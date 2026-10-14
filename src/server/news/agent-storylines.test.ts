import { beforeEach, expect, it, vi } from "vitest";
import { storylineProposalSchema } from "@/lib/news/storyline-suggestions";
import { storyFixture } from "@/test/news-storyline-fixture";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  reservation: { row: { id: "lease" }, draftId: null as string | null },
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
vi.mock("./storyline-reservations", async (original) => {
  const actual = await original<typeof import("./storyline-reservations")>();
  return {
    ...actual,
    lockSubmissionReservation: vi.fn(async () => state.reservation),
  };
});
const notify = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./storyline-draft-notify", () => ({
  notifyStorylineDraftReview: notify,
}));
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
  state.reservation = { row: { id: "lease" }, draftId: null };
  notify.mockReset();
  notify.mockResolvedValue(undefined);
});
it("stores a pending attributed draft without a model dependency or publishing", async () => {
  state.rows = [[{ id: "agent-a" }], articles, []];
  expect(
    await submitAgentStoryline(
      { agentId: "agent-a", ownerId: "owner-a" },
      proposal(),
      "lease",
    ),
  ).toMatchObject({ mode: "draft", reused: false });
  expect(state.writes[0]?.value).toMatchObject({
    agentId: "agent-a",
    ownerId: "owner-a",
    type: "news_storyline",
    status: "pending",
    metadata: { input: { status: "draft", revision: 0 } },
  });
  expect(state.writes[1]?.value).toEqual({ draftId: "stored-draft" });
  expect(state.writes[0]?.value.metadata).toMatchObject({
    destinationPath: expect.stringMatching(/^\/news\/stories\/drafts\//),
  });
  expect(notify).toHaveBeenCalledWith({
    draftId: "stored-draft",
    ownerId: "owner-a",
    title: proposal().titleEn,
  });
});
it("still stores the draft when notifying humans fails", async () => {
  state.rows = [[{ id: "agent-a" }], articles, []];
  notify.mockRejectedValue(new Error("mail down"));
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await expect(
    submitAgentStoryline(
      { agentId: "agent-a", ownerId: "owner-a" },
      proposal(),
      "lease",
    ),
  ).resolves.toMatchObject({ draftId: "stored-draft", reused: false });
  expect(log).toHaveBeenCalled();
  log.mockRestore();
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
      "lease",
    ),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(state.writes).toEqual([]);
});
it("reuses an already submitted reservation without another insert", async () => {
  state.reservation.draftId = "existing";
  state.rows = [[{ id: "agent-a" }]];
  expect(
    await submitAgentStoryline(
      { agentId: "agent-a", ownerId: "owner-a" },
      proposal(),
      "lease",
    ),
  ).toMatchObject({ draftId: "existing", reused: true });
  expect(state.writes).toEqual([]);
  expect(notify).not.toHaveBeenCalled();
});
it("caps outstanding proposals before consuming the reservation", async () => {
  state.rows = [
    [{ id: "agent-a" }],
    articles,
    Array.from({ length: 10 }, () => ({ id: "other", metadata: {} })),
  ];
  await expect(
    submitAgentStoryline(
      { agentId: "agent-a", ownerId: "owner-a" },
      proposal(),
      "lease",
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
