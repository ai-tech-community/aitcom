// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { parseNewsTableQuery } from "@/lib/news/table";
import { NEWS_FEEDS } from "@/server/news/feeds";

import {
  newsTableCountSql,
  newsTablePageWindow,
  newsTableSliceSql,
} from "./table-page-sql";

const dialect = new PgDialect({ casing: "snake_case" });

function renderCount(query: Parameters<typeof parseNewsTableQuery>[0] = {}) {
  return dialect.sqlToQuery(
    newsTableCountSql({
      query: parseNewsTableQuery(query),
      includeHiddenRumors: false,
      memberSource: "Member",
    }),
  );
}

describe("newsTablePageWindow", () => {
  it("pages past the old 400-row cap", () => {
    expect(newsTablePageWindow(517, 2, 20)).toEqual({
      page: 2,
      totalPages: 26,
      limit: 20,
      offset: 20,
    });
    expect(newsTablePageWindow(401, 21, 20)).toEqual({
      page: 21,
      totalPages: 21,
      limit: 20,
      offset: 400,
    });
  });

  it("clamps an empty table and a page past the end", () => {
    expect(newsTablePageWindow(0, 4, 20)).toMatchObject({
      page: 1,
      totalPages: 1,
      offset: 0,
    });
    expect(newsTablePageWindow(517, 99, 20)).toMatchObject({
      page: 26,
      offset: 500,
    });
  });
});

describe("news table SQL", () => {
  it("counts every matching row and pages with limit and offset", () => {
    const count = renderCount();
    expect(count.sql.toLowerCase()).toContain("count(*)");
    expect(count.sql.toLowerCase()).not.toContain("limit");
    expect(count.sql).toContain('"app"."news_item"');
    expect(count.sql).toContain('"app"."news_rumor"');

    const window = newsTablePageWindow(517, 2, 20);
    const slice = dialect.sqlToQuery(
      newsTableSliceSql({
        query: parseNewsTableQuery({ page: "2" }),
        includeHiddenRumors: false,
        memberSource: "Member",
        limit: window.limit,
        offset: window.offset,
      }),
    );
    expect(slice.sql.toLowerCase()).toContain("limit");
    expect(slice.sql.toLowerCase()).toContain("offset");
    expect(slice.params).toContain(20);
    expect(slice.params.filter((param) => param === 20)).toEqual([20, 20]);
  });

  it("filters a directory company through the startup link tables", () => {
    const { sql, params } = renderCount({ company: "dir:northstar-labs" });
    expect(sql).toContain('"app"."news_item_startup"');
    expect(sql).toContain('"app"."news_rumor_startup"');
    expect(params).toContain("northstar-labs");
  });

  it("skips the blank-byline scan for a writer who is not a source label", () => {
    const person = renderCount({ writer: "Ada Lovelace" });
    expect(person.sql).toContain(
      "left(regexp_replace(btrim(coalesce(\"author\", ''))",
    );
    expect(person.sql).not.toContain("btrim(coalesce(\"author\", '')) = ''");
    expect(person.params).toContain("Ada Lovelace");

    const feed = renderCount({ writer: "OpenAI News" });
    expect(feed.sql).toContain("btrim(coalesce(\"author\", '')) = ''");
  });

  it("searches with a regex the trigram indexes can use", () => {
    const { sql } = renderCount({ q: "OpenAI models" });
    expect(sql).toContain("~");
    expect(sql.toLowerCase()).toContain("lower(");
    expect(sql).not.toContain("regexp_replace(lower(title)");
  });

  it("does not match an unknown company id", () => {
    const { sql } = renderCount({ company: "not-a-company" });
    expect(sql).toContain("false");
  });

  it("keeps the more specific Microsoft host ahead of microsoft.com", () => {
    const { params } = renderCount({ source: "feed:news.microsoft.com" });
    const source = params.indexOf("feed:news.microsoft.com");
    const parent = params.indexOf("feed:microsoft.com");
    expect(source).toBeGreaterThanOrEqual(0);
    expect(parent).toBeGreaterThan(source);
  });
});

describe("e27 feed", () => {
  it("is not fetched and the migration deletes the stored row", () => {
    expect(NEWS_FEEDS.some((feed) => feed.url.includes("e27.co"))).toBe(false);
    const source = readFileSync(
      join(process.cwd(), "src/migrations/20261013d_drop_e27_feed.ts"),
      "utf8",
    );
    expect(source).toContain('DELETE FROM "app"."news_feed"');
    expect(source).toContain("https://e27.co/feed/");
    expect(source).not.toMatch(/news_item/);
  });
});
