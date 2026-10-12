import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  startups: [] as Array<{ slug: string; updatedAt: Date | string | null }>,
  roles: [] as Array<{ slug: string; updatedAt: Date | string | null }>,
}));

vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(state.startups),
        innerJoin: () => ({
          where: () => Promise.resolve(state.roles),
        }),
      }),
    }),
  },
}));

import {
  listSitemapContentUpdatedAt,
  sitemapRowUpdatedAt,
} from "./sitemap-updated-at";

const STARTUP_AT = new Date("2020-01-15T08:00:00.000Z");
const ROLE_AT = new Date("2021-06-01T12:00:00.000Z");

beforeEach(() => {
  state.startups = [];
  state.roles = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("sitemapRowUpdatedAt", () => {
  it("keeps a real timestamp and drops null, blank, and unparseable values", () => {
    expect(sitemapRowUpdatedAt(STARTUP_AT)).toEqual(STARTUP_AT);
    expect(sitemapRowUpdatedAt("2024-05-01T00:00:00.000Z")).toEqual(
      new Date("2024-05-01T00:00:00.000Z"),
    );
    expect(sitemapRowUpdatedAt(null)).toBeUndefined();
    expect(sitemapRowUpdatedAt(undefined)).toBeUndefined();
    expect(sitemapRowUpdatedAt("")).toBeUndefined();
    expect(sitemapRowUpdatedAt("not-a-date")).toBeUndefined();
  });
});

describe("listSitemapContentUpdatedAt", () => {
  it("maps approved startup and open role rows to their updated_at", async () => {
    state.startups = [
      { slug: "Amy", updatedAt: STARTUP_AT },
      { slug: "blank", updatedAt: null },
      { slug: "broken", updatedAt: "not-a-date" },
      { slug: "not a slug", updatedAt: STARTUP_AT },
    ];
    state.roles = [
      { slug: "Comm-It-Dba-Sql", updatedAt: ROLE_AT },
      { slug: "maze-employee-login-for-us-jobs", updatedAt: null },
    ];

    const first = await listSitemapContentUpdatedAt();
    const second = await listSitemapContentUpdatedAt();

    expect(first.get("/startups/amy")).toEqual(STARTUP_AT);
    expect(first.get("/jobs/comm-it-dba-sql")).toEqual(ROLE_AT);
    expect(first.has("/startups/blank")).toBe(false);
    expect(first.has("/startups/broken")).toBe(false);
    expect(first.has("/jobs/maze-employee-login-for-us-jobs")).toBe(false);
    expect(second.get("/startups/amy")).toEqual(first.get("/startups/amy"));
    expect(first.get("/startups/amy")).not.toEqual(
      new Date("2026-10-12T10:00:00.000Z"),
    );
  });
});
