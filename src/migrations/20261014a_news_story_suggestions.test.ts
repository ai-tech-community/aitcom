import { expect, it } from "vitest";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { newsStorySuggestions, user } from "@/server/db/schema";
import { up, down } from "./20261014a_news_story_suggestions";

it("stores a member suggestion against the member and keeps review state optional", () => {
  const config = getTableConfig(newsStorySuggestions);
  const owner = config.foreignKeys.find((key) =>
    key.reference().columns.some((column) => column.name === "userId"),
  );
  expect(owner?.reference().foreignTable).toBe(user);
  expect(owner?.onDelete).toBe("cascade");
  expect(config.checks.map((check) => check.name).sort()).toEqual([
    "news_story_suggestion_body_check",
    "news_story_suggestion_url_check",
  ]);
});

it("prepares DDL only and drops the table on the way down", async () => {
  const queries: string[] = [];
  const db = {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      queries.push(new PgDialect().sqlToQuery(query).sql);
    },
  };
  await up({ db } as never);
  expect(queries[0]).toContain(
    "CREATE TABLE IF NOT EXISTS app.news_story_suggestion",
  );
  expect(queries[0]).toContain("WHERE reviewed_at IS NULL");
  expect(queries[0]).not.toMatch(/INSERT INTO|UPDATE app/);
  await down({ db } as never);
  expect(queries[1]).toContain(
    "DROP TABLE IF EXISTS app.news_story_suggestion",
  );
});
