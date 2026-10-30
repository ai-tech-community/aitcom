// The magazine write page gates before it renders (Gate-Before-Fail):
// guests go to sign-in, everyone but an editor of the magazine gets 404.
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../../../messages/en.json";

const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  writing: null as { magazineId: number; magazineName: string } | null,
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
  loadMagazineWriting: async (_deps: unknown, opts: unknown) => {
    state.gateCalls.push(opts);
    return state.writing;
  },
}));
vi.mock("@/components/magazines/editor/magazine-article-workspace", () => ({
  MagazineArticleWorkspace: () => null,
}));

import MagazineWritePage, { dynamic, generateMetadata } from "./page";

const params = () => Promise.resolve({ locale: "en", slug: "night-owls" });

beforeEach(() => {
  state.session = { user: { id: "editor-1" } };
  state.writing = { magazineId: 42, magazineName: "The Gazette" };
  state.gateCalls = [];
});

describe("magazine write page", () => {
  it("is rendered per request and never indexed", async () => {
    expect(dynamic).toBe("force-dynamic");
    expect(await generateMetadata({ params: params() })).toMatchObject({
      title: "Write a magazine article",
      robots: { index: false },
    });
  });

  it("sends guests to sign in and back", async () => {
    state.session = null;
    await expect(MagazineWritePage({ params: params() })).rejects.toThrow(
      "NEXT_REDIRECT /en/auth/signin?redirect=/en/communities/night-owls/magazine/write",
    );
    expect(state.gateCalls).toEqual([]);
  });

  it("is a 404 for anyone who does not edit the magazine", async () => {
    state.writing = null;
    await expect(MagazineWritePage({ params: params() })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(state.gateCalls).toEqual([
      { communitySlug: "night-owls", viewerId: "editor-1" },
    ]);
  });

  it("opens the editor for the magazine", async () => {
    const page = await MagazineWritePage({ params: params() });
    expect(page.props).toEqual({
      communitySlug: "night-owls",
      writing: { magazineId: 42, magazineName: "The Gazette" },
    });
  });
});
