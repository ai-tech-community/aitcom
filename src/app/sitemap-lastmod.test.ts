import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/payload", () => ({
  getPayloadClient: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/communities/content-visibility-queries", () => ({
  hiddenContentCommunityIds: vi.fn(async () => []),
}));

import { buildSitemapEntries } from "./sitemap";

const STARTUP_UPDATED_AT = new Date("2020-01-15T08:00:00.000Z");
const ROLE_UPDATED_AT = new Date("2021-06-01T12:00:00.000Z");
const BUILD_CLOCK = new Date("2026-10-12T10:00:00.000Z");

const dates = new Map<string, Date>([
  ["/startups/amy", STARTUP_UPDATED_AT],
  ["/jobs/comm-it-dba-sql", ROLE_UPDATED_AT],
]);

function load(
  find?: (args: { collection: string }) => Promise<{ docs: unknown[] }>,
) {
  return buildSitemapEntries(
    async () => {
      if (!find) throw new Error("skip payload");
      return { find } as never;
    },
    async () => new Map(),
    async () => [],
    async () => ["/startups/amy", "/jobs/comm-it-dba-sql", "/startups?page=2"],
    async () => [],
    async () => dates,
  );
}

function entry(
  entries: Awaited<ReturnType<typeof buildSitemapEntries>>,
  path: string,
) {
  return entries.find(
    (item) => item.url === `https://www.aitcommunity.org/en${path}`,
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(Date, "now").mockReturnValue(BUILD_CLOCK.getTime());
});

describe("sitemap lastmod", () => {
  it("uses each startup and role row updatedAt instead of the build clock", async () => {
    const first = await load();
    const second = await load();

    expect(entry(first, "/startups/amy")?.lastModified).toEqual(
      STARTUP_UPDATED_AT,
    );
    expect(entry(first, "/jobs/comm-it-dba-sql")?.lastModified).toEqual(
      ROLE_UPDATED_AT,
    );
    expect(entry(second, "/startups/amy")?.lastModified).toEqual(
      entry(first, "/startups/amy")?.lastModified,
    );
    expect(entry(first, "/startups/amy")?.lastModified).not.toEqual(
      BUILD_CLOCK,
    );
  });

  it("omits lastmod for static pages and paths with no row date", async () => {
    const entries = await load();
    expect(entry(entries, "")?.lastModified).toBeUndefined();
    expect(entry(entries, "/events")?.lastModified).toBeUndefined();
    expect(entry(entries, "/join")?.lastModified).toBeUndefined();
    expect(entry(entries, "/startups?page=2")?.lastModified).toBeUndefined();
  });

  it("keeps a real event updatedAt and omits an unparseable one", async () => {
    const entries = await load(async ({ collection }) => {
      if (collection === "events") {
        return {
          docs: [
            { slug: "dated", updatedAt: "2024-05-01T00:00:00.000Z" },
            { slug: "broken", updatedAt: "not-a-date" },
            { slug: "blank", updatedAt: "" },
          ],
        };
      }
      return { docs: [] };
    });

    expect(entry(entries, "/events/dated")?.lastModified).toEqual(
      new Date("2024-05-01T00:00:00.000Z"),
    );
    expect(entry(entries, "/events/broken")?.lastModified).toBeUndefined();
    expect(entry(entries, "/events/blank")?.lastModified).toBeUndefined();
  });
});
