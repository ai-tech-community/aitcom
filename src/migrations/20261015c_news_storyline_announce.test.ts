import { expect, it } from "vitest";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";

import {
  newsStorylineAnnouncements,
  newsStorylines,
  user,
} from "@/server/db/schema";
import { down, up } from "./20261015c_news_storyline_announce";

it("adds nullable announce and opt-out columns and a unique send key", () => {
  const story = getTableConfig(newsStorylines);
  expect(story.columns.some((column) => column.name === "publishedAt")).toBe(
    true,
  );
  expect(story.columns.some((column) => column.name === "announcedAt")).toBe(
    true,
  );
  const member = getTableConfig(user);
  const optOut = member.columns.find(
    (column) => column.name === "newsStoryEmailOptedOutAt",
  );
  expect(optOut?.notNull).toBe(false);
  const sends = getTableConfig(newsStorylineAnnouncements);
  expect(sends.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
    "storylineId",
    "userId",
  ]);
  expect(
    sends.foreignKeys.find((key) =>
      key.reference().columns.some((column) => column.name === "storylineId"),
    )?.onDelete,
  ).toBe("cascade");
});

it("prepares DDL only and does not rewrite rows", async () => {
  const queries: string[] = [];
  const db = {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      queries.push(new PgDialect().sqlToQuery(query).sql);
    },
  };
  await up({ db } as never);
  const sql = queries.join("\n");
  expect(sql).toContain('ADD COLUMN IF NOT EXISTS "published_at" timestamp');
  expect(sql).toContain('ADD COLUMN IF NOT EXISTS "announced_at" timestamp');
  expect(sql).toContain(
    'ADD COLUMN IF NOT EXISTS "news_story_email_opted_out_at" timestamp',
  );
  expect(sql).toContain(
    "CREATE TABLE IF NOT EXISTS app.news_storyline_announcement",
  );
  expect(sql).toContain("PRIMARY KEY");
  expect(sql).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\s+FROM\b/i);
  await down({ db } as never);
  expect(queries.at(-1)).toContain(
    "DROP TABLE IF EXISTS app.news_storyline_announcement",
  );
  expect(queries.at(-1)).toContain("DROP COLUMN IF EXISTS");
});
