// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { backfillNewsSectorDefaults } from "./sectors";

const dialect = new PgDialect({ casing: "snake_case" });

it("backfills only rows that have no sector yet", async () => {
  const statements: string[] = [];
  const database = {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const rendered = dialect.sqlToQuery(query);
      statements.push(rendered.sql);
      if (rendered.sql.includes("count(*)")) return { rows: [{ total: 0 }] };
      return { rows: [] };
    },
  };
  const result = await backfillNewsSectorDefaults(1000, database);
  const community = statements.find((sql) =>
    sql.includes('"app"."community_news_sector"'),
  );
  expect(community).toContain("ON CONFLICT");
  expect(community).toContain("DO NOTHING");
  expect(statements.some((sql) => sql.includes('"sector" IS NULL'))).toBe(true);
  expect(statements.join("\n")).not.toMatch(/DELETE /i);
  expect(result).toEqual({
    communities: 0,
    feeds: 0,
    items: 0,
    remainingCommunities: 0,
    remainingFeeds: 0,
    remainingItems: 0,
  });
});

describe("sector story reads", () => {
  it("does not invent a story when the sector has no feed", async () => {
    const { listCommunityNews } = await import("./sectors");
    const database = {
      execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const rendered = dialect.sqlToQuery(query).sql;
        if (rendered.includes("community_news_sector")) {
          return { rows: [{ sector: "sports" }] };
        }
        if (rendered.includes("news_feed")) return { rows: [] };
        throw new Error(`unexpected query: ${rendered}`);
      },
    };
    const view = await listCommunityNews(database, "community-1");
    expect(view).toEqual({
      sector: "sports",
      hasRealFeeds: false,
      stories: [],
    });
  });
});
