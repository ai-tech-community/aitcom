import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  mode: "ok" as "ok" | "down" | "missing-uses-ai",
  calls: 0,
}));

vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => {
          state.calls += 1;
          if (state.mode === "down") {
            return Promise.reject(new Error("connection refused"));
          }
          if (state.mode === "missing-uses-ai" && state.calls === 1) {
            return Promise.reject(new Error('column "uses_ai" does not exist'));
          }
          return Promise.resolve(state.rows);
        },
      }),
    }),
  },
}));

import { listAiToolsHubStartups } from "./queries";

function row(partial: {
  name: string;
  slug: string;
  category: string;
  description: string | null;
  openRoleCount?: number;
}) {
  return {
    id: partial.slug,
    name: partial.name,
    homepage: "https://example.com",
    category: partial.category,
    sources: [],
    region: null,
    lat: null,
    lng: null,
    country: null,
    stage: null,
    logoUrl: null,
    description: partial.description,
    founders: [],
    investors: [],
    exitStatus: null,
    acquirer: null,
    exitOn: null,
    jobsUrl: null,
    listedOn: null,
    slug: partial.slug,
    openRoleCount: partial.openRoleCount ?? 0,
    usesAi: true,
  };
}

beforeEach(() => {
  state.rows = [];
  state.mode = "ok";
  state.calls = 0;
});

describe("listAiToolsHubStartups", () => {
  it("keeps indexable agents and models, drops thin rows, and sorts by name", async () => {
    const long = "a".repeat(80);
    state.rows = [
      row({
        name: "Vertical Co",
        slug: "vertical-co",
        category: "vertical",
        description: long,
      }),
      row({
        name: "Thin",
        slug: "thin",
        category: "agents",
        description: "a".repeat(79),
      }),
      row({
        name: "Padded thin",
        slug: "padded-thin",
        category: "agents",
        description: `  ${"a".repeat(79)}  `,
      }),
      row({
        name: "Model Co",
        slug: "model-co",
        category: "models",
        description: long,
      }),
      row({
        name: "Hiring",
        slug: "hiring",
        category: "agents",
        description: "Hi",
        openRoleCount: 2,
      }),
      row({
        name: "alpha",
        slug: "alpha-b",
        category: "agents",
        description: long,
      }),
      row({
        name: "Alpha",
        slug: "alpha",
        category: "agents",
        description: `  ${long}  `,
      }),
      row({
        name: "Blank",
        slug: "blank",
        category: "models",
        description: null,
      }),
    ];

    const cards = await listAiToolsHubStartups();
    expect(cards.map((card) => card.slug)).toEqual([
      "alpha",
      "alpha-b",
      "hiring",
      "model-co",
    ]);
    expect(cards.map((card) => card.category)).toEqual([
      "agents",
      "agents",
      "agents",
      "models",
    ]);
  });

  it("returns nothing when the query fails", async () => {
    state.mode = "down";
    state.rows = [
      row({
        name: "Alpha",
        slug: "alpha",
        category: "agents",
        description: "a".repeat(80),
      }),
    ];
    await expect(listAiToolsHubStartups()).resolves.toEqual([]);
  });

  it("retries when the uses_ai column is missing", async () => {
    state.mode = "missing-uses-ai";
    state.rows = [
      row({
        name: "Alpha",
        slug: "alpha",
        category: "agents",
        description: "a".repeat(80),
      }),
    ];
    const cards = await listAiToolsHubStartups();
    expect(state.calls).toBe(2);
    expect(cards.map((card) => card.slug)).toEqual(["alpha"]);
    expect(cards[0]?.usesAi).toBeNull();
  });
});
