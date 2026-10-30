import { describe, expect, it } from "vitest";

import { startupSourcedAnswer } from "./startup-sourced-answers";
import {
  startupProfileMetaDescription,
  type StartupPublicCard,
} from "./startups";

function card(overrides: Partial<StartupPublicCard> = {}): StartupPublicCard {
  return {
    id: "kueez",
    name: "Kueez",
    homepage: "https://weare.kueez.com/",
    category: "other",
    sources: ["https://weare.kueez.com/"],
    region: "Israel",
    lat: null,
    lng: null,
    country: "IL",
    stage: null,
    logoUrl: null,
    description: null,
    founders: [],
    investors: [],
    exitStatus: null,
    acquirer: null,
    exitOn: null,
    jobsUrl: null,
    listedOn: "2026-01-01",
    slug: "kueez",
    openRoleCount: 0,
    ...overrides,
  };
}

describe("startupProfileMetaDescription", () => {
  it("builds an empty profile from its sourced answer, not category and region", () => {
    const does = startupSourcedAnswer("kueez")?.statements.find(
      (statement) => statement.id === "does",
    );
    const description = startupProfileMetaDescription(card(), "en");
    expect(does?.text.length).toBeGreaterThanOrEqual(80);
    expect(description).toBe(does?.text);
    expect(description).not.toBe("Other · Israel");
    expect(startupProfileMetaDescription(card(), "nl")).toBe(does?.text);
    expect(startupProfileMetaDescription(card(), "nl")).not.toBe(
      "Overig · Israel",
    );
    expect(description).not.toMatch(/\$\s?\d/);
  });

  it("keeps a stored blurb on profiles that already have one", () => {
    const stored =
      "SalesPlay X is the AI account planning platform that helps sales teams create personalized sales materials.";
    expect(
      startupProfileMetaDescription(
        card({
          slug: "salesplay-x",
          name: "SalesPlay X",
          description: stored,
        }),
        "en",
      ),
    ).toBe(stored);
  });
});
