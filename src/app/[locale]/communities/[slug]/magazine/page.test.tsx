// The Magazine tab answers 404 when the read model does, and when the
// community has no magazine and the viewer cannot start one (preflight F8).
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../../messages/en.json";
import type { CommunityMagazineTabData } from "@/server/magazines/reading";

const state = vi.hoisted(() => ({
  data: null as CommunityMagazineTabData | null,
  calls: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
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
  getSession: async () => ({ user: { id: "viewer-1" } }),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/server/magazines/reading", () => ({
  loadCommunityMagazineTab: async (_deps: unknown, opts: unknown) => {
    state.calls.push(opts);
    return state.data;
  },
}));
vi.mock("@/components/magazines/community/magazine-tab", () => ({
  MagazineTab: () => null,
}));

import CommunityMagazinePage, { dynamic, generateMetadata } from "./page";

const params = Promise.resolve({ locale: "en", slug: "amsterdam-ai" });

const noMagazine = (viewerIsEditor: boolean): CommunityMagazineTabData => ({
  magazine: null,
  latest: null,
  issues: [],
  viewerIsEditor,
});

beforeEach(() => {
  state.data = null;
  state.calls = [];
});

describe("community Magazine tab page", () => {
  it("is rendered per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("is a 404 when the read model answers null", async () => {
    await expect(CommunityMagazinePage({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(state.calls[0]).toEqual({
      communitySlug: "amsterdam-ai",
      viewerId: "viewer-1",
      locale: "en",
    });
  });

  it("is a 404 for readers of a community without a magazine", async () => {
    state.data = noMagazine(false);
    await expect(CommunityMagazinePage({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("renders for editors of a community without a magazine", async () => {
    state.data = noMagazine(true);
    await expect(CommunityMagazinePage({ params })).resolves.toBeTruthy();
  });

  it("is not indexed: the magazine's shelf is its public page", async () => {
    state.data = noMagazine(true);
    const meta = await generateMetadata({ params });
    expect(meta.robots).toEqual({ index: false });
  });
});
