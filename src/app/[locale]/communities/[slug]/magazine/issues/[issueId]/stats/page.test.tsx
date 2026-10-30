import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { issueStats } from "@/test/magazine-issue-stats";
import en from "../../../../../../../../../messages/en.json";

const state = vi.hoisted(() => ({
  session: { user: { id: "editor" } } as { user: { id: string } } | null,
  allowed: true,
  stats: null as unknown,
  gate: vi.fn(),
  load: vi.fn(),
  community: vi.fn(),
  payload: {},
  db: { query: { communities: { findFirst: vi.fn() } } },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (opts: { namespace?: string }) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: opts.namespace as never,
    }),
}));
vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => state.session,
}));
vi.mock("@/server/db", () => ({ db: state.db }));
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => state.payload,
}));
vi.mock("@/server/magazines/issue-editing", () => ({
  canEditIssueAt: (...args: unknown[]) => {
    state.gate(...args);
    return state.allowed;
  },
}));
vi.mock("@/server/magazines/stats/issue-stats", () => ({
  loadIssueStats: (...args: unknown[]) => {
    state.load(...args);
    return state.stats;
  },
}));
vi.mock("@/components/magazines/editor/stats/issue-stats-view", () => ({
  IssueStatsView: () => null,
}));

import Page, { dynamic, generateMetadata } from "./page";
const params = (issueId = "5", locale = "en") =>
  Promise.resolve({ locale, slug: "night-owls", issueId });
beforeEach(() => {
  vi.clearAllMocks();
  state.session = { user: { id: "editor" } };
  state.allowed = true;
  state.stats = issueStats;
  state.db.query.communities.findFirst.mockResolvedValue({
    name: "Night Owls",
  });
});
describe("issue numbers page", () => {
  it("editors see the numbers; contributors and outsiders get 404", async () => {
    const page = await Page({ params: params("5", "nl") });
    expect(state.gate).toHaveBeenCalledWith(
      { db: state.db, payload: state.payload },
      { communitySlug: "night-owls", issueId: 5, viewerId: "editor" },
    );
    expect(state.load).toHaveBeenCalledWith(
      { db: state.db, payload: state.payload },
      5,
      "nl",
    );
    expect(page.props).toEqual({
      stats: issueStats,
      communitySlug: "night-owls",
      communityName: "Night Owls",
    });
    for (const id of ["contributor", "outsider", "other-editor"]) {
      state.session = { user: { id } };
      state.allowed = false;
      state.load.mockClear();
      await expect(Page({ params: params() })).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );
      expect(state.load).not.toHaveBeenCalled();
    }
  });
  it("is dynamic and never indexed", async () => {
    expect(dynamic).toBe("force-dynamic");
    expect(await generateMetadata({ params: params() })).toMatchObject({
      title: "Numbers",
      robots: { index: false },
    });
  });
  it("sends guests to sign in and back before reading anything", async () => {
    state.session = null;
    await expect(Page({ params: params() })).rejects.toThrow(
      "NEXT_REDIRECT /en/auth/signin?redirect=/en/communities/night-owls/magazine/issues/5/stats",
    );
    expect(state.gate).not.toHaveBeenCalled();
    expect(state.load).not.toHaveBeenCalled();
  });
  it.each(["abc", "0", "-1", "5.5", "9007199254740992"])(
    "returns 404 for invalid issue id %s",
    async (id) => {
      await expect(Page({ params: params(id) })).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );
      expect(state.gate).not.toHaveBeenCalled();
    },
  );
  it("returns 404 when an allowed issue disappears", async () => {
    state.stats = null;
    await expect(Page({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
