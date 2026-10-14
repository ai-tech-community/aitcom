import { beforeEach, expect, it, vi } from "vitest";
import { storylineInputSchema } from "@/lib/news/storylines";

const state = vi.hoisted(() => ({
  staff: false,
  save: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  search: vi.fn(),
  inbox: vi.fn(),
  dismiss: vi.fn(),
  submitSuggestion: vi.fn(),
  listSuggestions: vi.fn(),
  reviewSuggestion: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: {} }));
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
vi.mock("@/server/news/staff", () => ({
  isNewsStaff: async () => state.staff,
}));
vi.mock("@/server/news/rumors", () => ({
  rumorDb: {},
  moderateNewsRumor: vi.fn(),
  submitNewsRumor: vi.fn(),
}));
vi.mock("@/server/news/storylines", () => ({
  saveStoryline: state.save,
  listStorylines: state.list,
  findStoryline: state.read,
  searchStorylineArticles: state.search,
  StorylineError: class extends Error {},
}));
vi.mock("@/server/news/agent-storylines", () => ({
  listAgentStorylineDrafts: state.inbox,
  dismissAgentStorylineDraft: state.dismiss,
}));
vi.mock("@/server/news/story-suggestions", () => ({
  storySuggestionDb: {},
  submitStorySuggestion: state.submitSuggestion,
  listOpenStorySuggestions: state.listSuggestions,
  reviewStorySuggestion: state.reviewSuggestion,
}));
vi.mock("@/server/news/contributions", () => ({
  claimWeeklyTopic: vi.fn(),
  listMemberClaims: vi.fn(),
  listWeeklyContributorBoard: vi.fn(async () => []),
  storyCoverageToday: vi.fn(async () => ({
    covered: 0,
    total: 5,
    visible: false,
  })),
  recordPublishedStoryCredit: vi.fn(async () => "skipped"),
}));
import { newsRouter } from "./news";

const caller = (signedIn = true) =>
  newsRouter.createCaller({
    db: {} as never,
    headers: new Headers(),
    session: signedIn
      ? ({ user: { id: "editor", email: "editor@example.org" } } as never)
      : null,
  });
const draft = storylineInputSchema.parse({
  slug: "local-ai",
  titleEn: "Local AI",
  status: "draft",
  articles: [],
});
beforeEach(() => {
  state.staff = false;
  vi.clearAllMocks();
});
it("denies every editorial endpoint to ordinary members before storage access", async () => {
  await expect(caller().listStorylines({})).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(caller().readStoryline({ id: "s" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(caller().searchStorylineArticles({})).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(caller().saveStoryline(draft)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(caller().listAgentStorylineDrafts({})).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    caller().dismissAgentStorylineDraft({ draftId: "d1" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(caller().listOpenStorySuggestions()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    caller().reviewStorySuggestion({ id: "s1" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  for (const fn of [
    state.list,
    state.read,
    state.search,
    state.save,
    state.inbox,
    state.dismiss,
    state.listSuggestions,
    state.reviewSuggestion,
  ])
    expect(fn).not.toHaveBeenCalled();
});
it("requires a session even if the staff lookup would succeed", async () => {
  state.staff = true;
  await expect(caller(false).saveStoryline(draft)).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  expect(state.save).not.toHaveBeenCalled();
});
it("attributes a staff save to the authenticated user", async () => {
  state.staff = true;
  state.save.mockResolvedValue({ id: "saved" });
  expect(await caller().saveStoryline(draft)).toEqual({ id: "saved" });
  expect(state.save).toHaveBeenCalledWith(draft, "editor");
});

it("allows staff to read and dismiss proposals in the editorial inbox", async () => {
  state.staff = true;
  state.inbox.mockResolvedValue({
    items: [],
    invalidItems: [],
    page: 1,
    totalPages: 1,
  });
  await caller().listAgentStorylineDrafts({});
  expect(state.inbox).toHaveBeenCalledWith(1);
  state.dismiss.mockResolvedValue({ id: "d1" });
  await caller().dismissAgentStorylineDraft({ draftId: "d1" });
  expect(state.dismiss).toHaveBeenCalledWith("d1");
});

it("stores a valid suggestion for a signed-in member and rejects a bad link", async () => {
  state.submitSuggestion.mockResolvedValue({ ok: true, id: "sug-1" });
  await expect(
    caller().submitStorySuggestion({ text: "https://example.com/source" }),
  ).resolves.toEqual({ id: "sug-1" });
  expect(state.submitSuggestion).toHaveBeenCalledWith(
    {},
    expect.objectContaining({
      userId: "editor",
      value: {
        body: "https://example.com/source",
        url: "https://example.com/source",
      },
    }),
  );
  await expect(
    caller().submitStorySuggestion({ text: "http://example.com/source" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "url" });
  await expect(
    caller(false).submitStorySuggestion({ text: "A story about local models" }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

it("claims a story only through a mutation", () => {
  const claim = newsRouter._def.procedures.claimStoryTopic as {
    _def: { type?: string };
  };
  expect(claim._def.type).toBe("mutation");
});

it("rate-limits suggestions and lets staff review the queue", async () => {
  state.submitSuggestion.mockResolvedValue({ ok: false, reason: "limited" });
  await expect(
    caller().submitStorySuggestion({ text: "A story about local models" }),
  ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: "rate" });
  state.staff = true;
  state.listSuggestions.mockResolvedValue([]);
  await expect(caller().listOpenStorySuggestions()).resolves.toEqual([]);
  state.reviewSuggestion.mockResolvedValue("ok");
  await expect(
    caller().reviewStorySuggestion({ id: "sug-1" }),
  ).resolves.toEqual({
    ok: true,
  });
  state.reviewSuggestion.mockResolvedValue("missing");
  await expect(
    caller().reviewStorySuggestion({ id: "missing" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
