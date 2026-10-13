import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StartupPublicCard } from "@/lib/investigations/startups";

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "nl",
  card: null as StartupPublicCard | null,
}));

vi.mock("server-only", () => ({}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => state.locale,
  getTranslations: async () => (key: string) => key,
}));

vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => null,
}));

vi.mock("@/server/startups/queries", () => ({
  findApprovedPublicStartupBySlug: async () => state.card,
  listOpenStartupRolesForCompany: async () => [],
}));

vi.mock("@/components/investigations/startups-profile", () => ({
  StartupsProfilePage: () => null,
}));

import { generateMetadata } from "./page";

function card(overrides: Partial<StartupPublicCard> = {}): StartupPublicCard {
  return {
    id: "amy",
    name: "Amy",
    homepage: "https://amy.example",
    category: "other",
    sources: [],
    region: "Israel",
    lat: null,
    lng: null,
    country: null,
    stage: null,
    logoUrl: null,
    description: "Short",
    founders: [],
    investors: [],
    exitStatus: null,
    acquirer: null,
    exitOn: null,
    jobsUrl: null,
    listedOn: "2026-09-16",
    slug: "amy",
    openRoleCount: 0,
    ...overrides,
  };
}

const params = () => Promise.resolve({ slug: "amy" });

beforeEach(() => {
  state.locale = "en";
  state.card = null;
});

describe("startup profile robots", () => {
  it.each(["en", "nl"] as const)(
    "noindexes a thin profile in %s and follows links",
    async (locale) => {
      state.locale = locale;
      state.card = card({ description: "a".repeat(79), openRoleCount: 0 });
      const meta = await generateMetadata({ params: params() });
      expect(meta.robots).toEqual({ index: false, follow: true });
    },
  );

  it("indexes a startup whose description is 80 characters", async () => {
    state.card = card({ description: "a".repeat(80), openRoleCount: 0 });
    const meta = await generateMetadata({ params: params() });
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it("indexes a short profile that has an open role", async () => {
    state.card = card({ description: "Short", openRoleCount: 1 });
    const meta = await generateMetadata({ params: params() });
    expect(meta.robots).toEqual({ index: true, follow: true });
  });
});
