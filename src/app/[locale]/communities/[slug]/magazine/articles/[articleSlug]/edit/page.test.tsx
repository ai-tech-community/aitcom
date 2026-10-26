// The magazine article edit page gates before it renders
// (Gate-Before-Fail): guests go to sign-in; anything but the author, an
// editor of this community's magazine, editing its article gets 404.
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../../../../../messages/en.json";

const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  editing: null as Record<string, unknown> | null,
  gateCalls: [] as unknown[],
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
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/server/magazines/magazine-articles", () => ({
  loadMagazineArticleForEditing: async (_deps: unknown, opts: unknown) => {
    state.gateCalls.push(opts);
    return state.editing;
  },
}));
vi.mock("@/components/magazines/editor/magazine-article-workspace", () => ({
  MagazineArticleWorkspace: () => null,
}));

import MagazineArticleEditPage, { dynamic, generateMetadata } from "./page";

const params = () =>
  Promise.resolve({
    locale: "en",
    slug: "night-owls",
    articleSlug: "owl-notes-1",
  });

const ARTICLE = {
  id: 7,
  title: "Owl notes",
  slug: "owl-notes-1",
  content: { root: { children: [] } },
  type: "article",
  tags: [{ tag: "owls" }],
  mediaUrl: null,
  reviewStatus: "approved",
  reviewNote: null,
};

beforeEach(() => {
  state.session = { user: { id: "editor-1" } };
  state.editing = {
    magazineId: 42,
    magazineName: "The Gazette",
    article: ARTICLE,
  };
  state.gateCalls = [];
});

describe("magazine article edit page", () => {
  it("is rendered per request and never indexed", async () => {
    expect(dynamic).toBe("force-dynamic");
    expect(await generateMetadata({ params: params() })).toMatchObject({
      title: "Edit magazine article",
      robots: { index: false },
    });
  });

  it("sends guests to sign in and back", async () => {
    state.session = null;
    await expect(MagazineArticleEditPage({ params: params() })).rejects.toThrow(
      "NEXT_REDIRECT /en/auth/signin?redirect=/en/communities/night-owls/magazine/articles/owl-notes-1/edit",
    );
    expect(state.gateCalls).toEqual([]);
  });

  it("is a 404 unless the viewer edits the magazine and wrote the article", async () => {
    state.editing = null;
    await expect(MagazineArticleEditPage({ params: params() })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(state.gateCalls).toEqual([
      {
        communitySlug: "night-owls",
        articleSlug: "owl-notes-1",
        viewerId: "editor-1",
      },
    ]);
  });

  it("opens the saved article in the editor for the magazine", async () => {
    const page = await MagazineArticleEditPage({ params: params() });
    expect(page.props).toEqual({
      communitySlug: "night-owls",
      writing: { magazineId: 42, magazineName: "The Gazette" },
      initialData: {
        id: 7,
        title: "Owl notes",
        slug: "owl-notes-1",
        content: { root: { children: [] } },
        type: "article",
        tags: [{ tag: "owls" }],
        mediaUrl: undefined,
        reviewStatus: "approved",
        reviewNote: undefined,
      },
    });
  });
});
