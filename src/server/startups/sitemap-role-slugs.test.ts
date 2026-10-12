import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<{
    slug: string;
    title: string;
    descriptionText: string | null;
  }>,
}));

vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve(state.rows),
        }),
      }),
    }),
  },
}));

import { listOpenStartupRoleSlugs } from "./queries";

const LONG = "a".repeat(200);

beforeEach(() => {
  state.rows = [];
});

describe("listOpenStartupRoleSlugs", () => {
  it("drops thin descriptions and titles the existing filter rejects", async () => {
    state.rows = [
      {
        slug: "maze-employee-login-for-us-jobs",
        title: "Employee Login for US Jobs",
        descriptionText: null,
      },
      {
        slug: "comm-it-dba-sql",
        title: "DBA SQL",
        descriptionText: "a".repeat(119),
      },
      {
        slug: "view-job",
        title: "View Job",
        descriptionText: LONG,
      },
      {
        slug: "fixture-co-staff-engineer",
        title: "Staff Engineer",
        descriptionText: LONG,
      },
      {
        slug: "not a slug",
        title: "Staff Engineer",
        descriptionText: LONG,
      },
    ];

    await expect(listOpenStartupRoleSlugs()).resolves.toEqual([
      "fixture-co-staff-engineer",
    ]);
  });
});
