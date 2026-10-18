// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/db", () => ({ db: {} }));
import type { db as database } from "@/server/db";
import { loadHomeNews } from "./home";

function fakeDb(news: unknown[] | Error, stories: unknown[] | Error) {
  const queries = [news, stories].map((result) => {
    const query = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn(() =>
        result instanceof Error
          ? Promise.reject(result)
          : Promise.resolve(result),
      ),
    };
    return query;
  });
  let at = 0;
  return {
    db: { select: vi.fn(() => queries[at++]) } as unknown as typeof database,
    queries,
  };
}
const news = (id: string, day: number) => ({
  id,
  title: `News ${id}`,
  summary: "<p>Daily &amp; useful</p>",
  url: "https://example.com/news",
  date: new Date(Date.UTC(2026, 9, day)),
});
const story = {
  id: "story",
  slug: "a-story",
  titleEn: "A story",
  titleNl: "Een verhaal",
  overviewEn: "The context.",
  overviewNl: "De context.",
  date: new Date("2026-10-17T00:00:00Z"),
};

describe("loadHomeNews", () => {
  it("mixes the latest news and stories by date while reserving space for stories", async () => {
    const { db, queries } = fakeDb(
      [20, 19, 18, 17, 16, 15].map((day) => news(String(day), day)),
      [
        story,
        {
          ...story,
          id: "older",
          slug: "older",
          date: new Date("2026-10-01T00:00:00Z"),
        },
      ],
    );
    const items = await loadHomeNews(db, "en");
    expect(items).toHaveLength(6);
    expect(items.filter((item) => item.kind === "story")).toHaveLength(2);
    expect(items[0]?.title).toBe("News 20");
    expect(items.at(-1)?.href).toBe("/news/stories/older");
    expect(items[0]?.summary).toBe("Daily & useful");
    expect(queries[0]?.limit).toHaveBeenCalledWith(6);
    expect(queries[1]?.limit).toHaveBeenCalledWith(2);
    const where = new PgDialect({ casing: "snake_case" }).sqlToQuery(
      queries[1]!.where.mock.calls[0]![0],
    );
    expect(where.params).toContain("published");
    expect(where.sql).toContain(">= 2");
    expect(where.sql).toContain("overview_en");
  });
  it("uses Dutch copy and explicitly marks an English fallback", async () => {
    const { db } = fakeDb(
      [],
      [story, { ...story, id: "fallback", titleNl: "", overviewNl: "" }],
    );
    const items = await loadHomeNews(db, "nl");
    expect(items.find((item) => item.id === "story")).toMatchObject({
      title: "Een verhaal",
      summary: "De context.",
      englishFallback: false,
    });
    expect(items.find((item) => item.id === "fallback")).toMatchObject({
      title: "A story",
      englishFallback: true,
    });
  });
  it("fills all six slots with news when there are no published stories", async () => {
    const { db } = fakeDb(
      [20, 19, 18, 17, 16, 15].map((day) => news(String(day), day)),
      [],
    );
    expect(await loadHomeNews(db, "en")).toHaveLength(6);
  });
  it("keeps one source available when the other fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { db } = fakeDb(new Error("unavailable"), [story]);
      expect(await loadHomeNews(db, "en")).toMatchObject([
        { kind: "story", title: "A story" },
      ]);
      const both = fakeDb(new Error("unavailable"), new Error("unavailable"));
      expect(await loadHomeNews(both.db, "en")).toEqual([]);
    } finally {
      log.mockRestore();
    }
  });
});
