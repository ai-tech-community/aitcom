import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<{
    slug: string;
    description: string | null;
    openRoleCount: number;
  }>,
}));

vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(state.rows),
      }),
    }),
  },
}));

import { listApprovedPublicStartupSlugs } from "./queries";

beforeEach(() => {
  state.rows = [];
});

describe("listApprovedPublicStartupSlugs", () => {
  it("drops thin approved startups and keeps a long description or an open role", async () => {
    state.rows = [
      { slug: "amy", description: "Short blurb", openRoleCount: 0 },
      {
        slug: "padded",
        description: `  ${"a".repeat(79)}  `,
        openRoleCount: 0,
      },
      { slug: "filled", description: "a".repeat(80), openRoleCount: 0 },
      { slug: "hiring", description: "Hi", openRoleCount: 1 },
      { slug: "not a slug", description: "a".repeat(80), openRoleCount: 0 },
      { slug: "kueez", description: null, openRoleCount: 0 },
      { slug: "blank-co", description: null, openRoleCount: 0 },
    ];

    await expect(listApprovedPublicStartupSlugs()).resolves.toEqual([
      "filled",
      "hiring",
      "kueez",
    ]);
  });
});
