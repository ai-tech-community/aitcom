import { expect, it } from "vitest";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { newsContributions, newsStorylines, user } from "@/server/db/schema";
import { up, down } from "./20261014b_news_contributions";

it("keeps one row per member, topic, and kind, and one breaking bonus per topic", () => {
  const config = getTableConfig(newsContributions);
  const names = config.indexes.map((index) => index.config.name).sort();
  expect(names).toEqual([
    "news_contribution_breaking_topic_idx",
    "news_contribution_created_idx",
    "news_contribution_user_created_idx",
    "news_contribution_user_topic_kind_idx",
  ]);
  const tables = config.foreignKeys.map((key) => key.reference().foreignTable);
  expect(tables).toContain(user);
  expect(tables).toContain(newsStorylines);
});

it("prepares DDL only", async () => {
  const queries: string[] = [];
  const db = {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      queries.push(new PgDialect().sqlToQuery(query).sql);
    },
  };
  await up({ db } as never);
  expect(queries[0]).toContain(
    "CREATE TABLE IF NOT EXISTS app.news_contribution",
  );
  expect(queries[0]).toContain("WHERE kind = 'breaking'");
  expect(queries[0]).not.toMatch(/INSERT INTO|UPDATE app/);
  await down({ db } as never);
  expect(queries[1]).toContain("DROP TABLE IF EXISTS app.news_contribution");
});
