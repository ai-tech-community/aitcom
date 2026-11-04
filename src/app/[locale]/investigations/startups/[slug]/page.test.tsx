import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StartupPublicCard } from "@/lib/investigations/startups";

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "nl" | "fr",
  card: null as StartupPublicCard | null,
}));

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => state.locale,
  getTranslations: async () => (key: string) => key,
}));

vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => null,
}));

vi.mock("@/server/startups/queries", () => ({
  findApprovedPublicStartupBySlug: async (slug: string) =>
    state.card?.slug === slug ? state.card : null,
  listOpenStartupRolesForCompany: async () => [],
}));

vi.mock("@/server/news/startup-links", () => ({
  listStartupNewsMentions: async () => [],
}));

vi.mock("@/components/investigations/startups-profile", () => ({
  StartupsProfilePage: () => null,
}));

import InvestigationStartupRoute, { generateMetadata } from "./page";

function card(overrides: Partial<StartupPublicCard> = {}): StartupPublicCard {
  return {
    id: "amy",
    name: "Amy",
    homepage: "https://amy.example",
    category: "other",
    sources: [],
    region: null,
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

beforeEach(() => {
  state.locale = "en";
  state.card = null;
});

describe("investigations startup URL", () => {
  it("canonicalizes a different entity to /startups/<slug>", async () => {
    state.card = card({
      slug: "ai-tools-list",
      name: "AI TOOLS LIST",
      description: "a".repeat(80),
    });
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "ai-tools-list" }),
    });
    expect(meta.alternates?.canonical).toBe(
      "https://www.aitcommunity.org/en/startups/ai-tools-list",
    );
    expect(meta.robots).toEqual({ index: true, follow: true });
    await expect(
      InvestigationStartupRoute({
        params: Promise.resolve({ slug: "ai-tools-list" }),
      }),
    ).resolves.toBeTruthy();
  });

  it("gives Navier AI no canonical in every locale", async () => {
    state.card = card({
      slug: "navier-ai",
      name: "Navier AI",
      description: null,
      openRoleCount: 2,
    });
    for (const locale of ["en", "nl", "fr"] as const) {
      state.locale = locale;
      const meta = await generateMetadata({
        params: Promise.resolve({ slug: "navier-ai" }),
      });
      expect(meta.alternates?.canonical).toBeUndefined();
      expect(meta.alternates?.languages).toMatchObject({
        en: "https://www.aitcommunity.org/en/investigations/startups/navier-ai",
        nl: "https://www.aitcommunity.org/nl/investigations/startups/navier-ai",
        fr: "https://www.aitcommunity.org/fr/investigations/startups/navier-ai",
      });
      expect(meta.robots).toEqual({ index: true, follow: true });
    }
  });

  it("does not render a same-entity profile", async () => {
    state.card = card({ slug: "acme", name: "Acme" });
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "acme" }),
    });
    expect(meta.title).toBe("profileNotFound");
    expect(meta.alternates?.canonical).toBeUndefined();
    await expect(
      InvestigationStartupRoute({ params: Promise.resolve({ slug: "acme" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
