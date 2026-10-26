// A magazine's shelf answers 404 when the read model does, and is indexed
// only when it holds an issue anyone may read (effective visibility, F10).
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../messages/en.json";
import { issueCard, shelfData } from "@/components/magazines/test-fixtures";
import type { MagazineShelfData } from "@/server/magazines/reading";

const state = vi.hoisted(() => ({
  data: null as MagazineShelfData | null,
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
  getLocale: async () => "en",
}));
vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => ({ user: { id: "viewer-1" } }),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/server/magazines/reading", () => ({
  loadMagazineShelf: async (_deps: unknown, opts: unknown) => {
    state.calls.push(opts);
    return state.data;
  },
}));

import MagazineShelfPage, { dynamic, generateMetadata } from "./page";

const params = Promise.resolve({ locale: "en", magazineSlug: "agents-weekly" });

beforeEach(() => {
  state.data = null;
  state.calls = [];
});

describe("magazine shelf page", () => {
  it("is rendered per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("is a 404 with empty metadata when the read model answers null", async () => {
    await expect(MagazineShelfPage({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(await generateMetadata({ params })).toEqual({});
    expect(state.calls[0]).toEqual({
      magazineSlug: "agents-weekly",
      viewerId: "viewer-1",
      locale: "en",
    });
  });

  it("indexes a shelf with an issue anyone may read", async () => {
    state.data = shelfData();
    const meta = await generateMetadata({ params });
    expect(meta.title).toBe("Agents Weekly");
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.canonical).toEqual(
      expect.stringMatching(/\/en\/magazines\/agents-weekly$/),
    );
  });

  it("keeps a shelf of members-only issues out of search", async () => {
    state.data = shelfData({
      issues: [
        issueCard({ visibility: "public", effectiveVisibility: "members" }),
      ],
    });
    const meta = await generateMetadata({ params });
    expect(meta.robots).toEqual({ index: false });
  });
});
