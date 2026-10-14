import { beforeEach, expect, it, vi } from "vitest";
import { storyFixture } from "@/test/news-storyline-fixture";

const state = vi.hoisted(() => ({
  agent: {
    agentId: "agent-a",
    ownerId: "owner-a" as string | null,
    scopes: ["read", "contribute"],
  },
  browse: vi.fn(),
  stories: vi.fn(),
  submit: vi.fn(),
  reserve: vi.fn(),
  research: vi.fn(),
  release: vi.fn(),
}));
vi.mock("@/server/db", () => ({
  db: { update: () => ({ set: () => ({ where: async () => undefined }) }) },
}));
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    NEXT_PUBLIC_APP_URL: "https://example.org",
    DATABASE_URL: "postgres://localhost:1/none",
  },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: async () => state.agent,
}));
vi.mock("@/server/news/storylines", () => ({
  searchStorylineArticles: state.browse,
  listStorylines: state.stories,
}));
vi.mock("@/server/news/agent-storylines", () => ({
  submitAgentStoryline: state.submit,
}));
vi.mock("@/server/news/storyline-reservations", async (original) => {
  const actual =
    await original<typeof import("@/server/news/storyline-reservations")>();
  return {
    ...actual,
    reserveStoryline: state.reserve,
    listStorylineResearch: state.research,
    releaseStorylineReservation: state.release,
  };
});
import { createTRPCRouter } from "@/server/api/trpc";
import { db } from "@/server/db";
import { agentNewsRouter } from "./agent-news";
const caller = (key = true) =>
  createTRPCRouter(agentNewsRouter).createCaller({
    db,
    session: null,
    headers: new Headers(key ? { authorization: "Bearer test-agent-key" } : {}),
  });
const proposal = {
  reservationId: "lease",
  slug: storyFixture.slug,
  titleEn: storyFixture.titleEn,
  overviewEn: storyFixture.overviewEn,
  questionsEn: [],
  articles: storyFixture.articles.map(({ articleId, noteEn, evidence }) => ({
    articleId,
    noteEn,
    evidence,
  })),
};
beforeEach(() => {
  vi.clearAllMocks();
  state.agent = {
    agentId: "agent-a",
    ownerId: "owner-a",
    scopes: ["read", "contribute"],
  };
});
it("requires an authenticated agent and read scope for archive access", async () => {
  await expect(caller(false).browseNews({})).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  state.agent.scopes = [];
  await expect(caller().browseNews({})).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(state.browse).not.toHaveBeenCalled();
});
it("requires a claimed owner and manifest-gated contribution scope", async () => {
  state.agent.scopes = ["read"];
  await expect(caller().proposeNewsStoryline(proposal)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  state.agent.scopes = ["read", "contribute"];
  state.agent.ownerId = null;
  await expect(caller().proposeNewsStoryline(proposal)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(state.submit).not.toHaveBeenCalled();
});
it("derives agent and owner attribution from authentication, never proposal fields", async () => {
  state.submit.mockResolvedValue({
    mode: "draft",
    draftId: "d1",
    reused: false,
  });
  const result = await caller().proposeNewsStoryline({
    ...proposal,
    agentId: "forged",
    ownerId: "forged",
    status: "published",
  } as typeof proposal);
  expect(result.mode).toBe("draft");
  expect(state.submit).toHaveBeenCalledWith(
    { agentId: "agent-a", ownerId: "owner-a" },
    (({ reservationId: _id, ...rest }) => rest)(proposal),
    "lease",
  );
});
it("returns public storyline summaries without private reviewer IDs or drafts", async () => {
  state.stories.mockResolvedValue({
    items: [
      {
        ...storyFixture,
        articleCount: 3,
        latestAt: null,
        createdBy: "private-editor",
      },
    ],
    page: 1,
    totalPages: 1,
    total: 1,
  });
  const result = await caller().browseNewsStorylines({});
  expect(state.stories).toHaveBeenCalledWith({ q: "", page: 1 });
  expect(result.items[0]).not.toHaveProperty("createdBy");
  expect(result.items[0]).not.toHaveProperty("connections");
});

it("gates claims/releases and derives reservation ownership from the agent session", async () => {
  state.agent.scopes = ["read"];
  await expect(
    caller().reserveNewsStoryline({ topicKey: "local-ai", title: "Local AI" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    caller().releaseNewsStoryline({ reservationId: "lease" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  state.agent.scopes = ["read", "contribute"];
  await caller().reserveNewsStoryline({
    topicKey: "local-ai",
    title: "Local AI",
  });
  expect(state.reserve).toHaveBeenCalledWith(
    { agentId: "agent-a", ownerId: "owner-a" },
    { topicKey: "local-ai", title: "Local AI" },
  );
  await caller().releaseNewsStoryline({ reservationId: "lease" });
  expect(state.release).toHaveBeenCalledWith(
    { agentId: "agent-a", ownerId: "owner-a" },
    "lease",
  );
});
it("requires read scope for shared research and a reservation token for proposals", async () => {
  state.agent.scopes = [];
  await expect(caller().browseNewsResearch()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  state.agent.scopes = ["read", "contribute"];
  const { reservationId: _id, ...withoutLease } = proposal;
  await expect(
    caller().proposeNewsStoryline(withoutLease as typeof proposal),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(state.submit).not.toHaveBeenCalled();
});
