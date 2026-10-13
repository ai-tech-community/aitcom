import { beforeEach, expect, it, vi } from "vitest";
import { storylineInputSchema } from "@/lib/news/storylines";

const state = vi.hoisted(() => ({
  staff: false,
  save: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  search: vi.fn(),
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
  for (const fn of [state.list, state.read, state.search, state.save])
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
