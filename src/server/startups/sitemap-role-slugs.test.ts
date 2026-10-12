import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<{
    slug: string;
    title: string;
    rawChars: number;
    nonWsChars: number;
  }>,
  bodies: [] as Array<{
    slug: string;
    descriptionText: string | null;
  }>,
  listKeys: [] as string[],
  bodyKeys: [] as string[],
  failBodies: false,
}));

vi.mock("@/server/db", () => ({
  db: {
    select: (fields?: Record<string, unknown>) => ({
      from: () => ({
        innerJoin: () => ({
          where: () => {
            state.listKeys = fields ? Object.keys(fields) : [];
            return Promise.resolve(state.rows);
          },
        }),
        where: () => {
          state.bodyKeys = fields ? Object.keys(fields) : [];
          if (state.failBodies)
            return Promise.reject(new Error("body read failed"));
          return Promise.resolve(state.bodies);
        },
      }),
    }),
  },
}));

import { listOpenStartupRoleSlugs } from "./queries";

beforeEach(() => {
  state.rows = [];
  state.bodies = [];
  state.listKeys = [];
  state.bodyKeys = [];
  state.failBodies = false;
});

describe("listOpenStartupRoleSlugs", () => {
  it("drops thin descriptions and titles the existing filter rejects", async () => {
    state.rows = [
      {
        slug: "maze-employee-login-for-us-jobs",
        title: "Employee Login for US Jobs",
        rawChars: 0,
        nonWsChars: 0,
      },
      {
        slug: "comm-it-dba-sql",
        title: "DBA SQL",
        rawChars: 119,
        nonWsChars: 119,
      },
      {
        slug: "view-job",
        title: "View Job",
        rawChars: 400,
        nonWsChars: 400,
      },
      {
        slug: "fixture-co-staff-engineer",
        title: "Staff Engineer",
        rawChars: 400,
        nonWsChars: 400,
      },
      {
        slug: "not a slug",
        title: "Staff Engineer",
        rawChars: 400,
        nonWsChars: 400,
      },
    ];

    await expect(listOpenStartupRoleSlugs()).resolves.toEqual([
      "fixture-co-staff-engineer",
    ]);
    expect(state.listKeys).toEqual(
      expect.arrayContaining(["slug", "title", "rawChars", "nonWsChars"]),
    );
    expect(state.listKeys).not.toContain("descriptionText");
    expect(state.bodyKeys).toEqual([]);
  });

  it("loads the description only for the length band that can cross 200", async () => {
    const bandBody = `learn more ${"c".repeat(190)}`;
    const indexableBand = `${"d".repeat(210)}${" ".repeat(40)}`;
    state.rows = [
      {
        slug: "band-thin",
        title: "Staff Engineer",
        rawChars: bandBody.length,
        nonWsChars: 199,
      },
      {
        slug: "band-engineer",
        title: "Staff Engineer",
        rawChars: indexableBand.length,
        nonWsChars: 210,
      },
      {
        slug: "fixture-co-staff-engineer",
        title: "Staff Engineer",
        rawChars: 400,
        nonWsChars: 400,
      },
    ];
    state.bodies = [
      { slug: "band-thin", descriptionText: bandBody },
      { slug: "band-engineer", descriptionText: indexableBand },
    ];

    await expect(listOpenStartupRoleSlugs()).resolves.toEqual([
      "band-engineer",
      "fixture-co-staff-engineer",
    ]);
    expect(state.bodyKeys).toEqual(
      expect.arrayContaining(["slug", "descriptionText"]),
    );
  });

  it("keeps decided roles when the band description read fails", async () => {
    state.failBodies = true;
    state.rows = [
      {
        slug: "band-engineer",
        title: "Staff Engineer",
        rawChars: 250,
        nonWsChars: 210,
      },
      {
        slug: "fixture-co-staff-engineer",
        title: "Staff Engineer",
        rawChars: 400,
        nonWsChars: 400,
      },
    ];

    await expect(listOpenStartupRoleSlugs()).resolves.toEqual([
      "fixture-co-staff-engineer",
    ]);
  });
});
