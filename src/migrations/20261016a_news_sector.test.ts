import { expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import { up, down } from "./20261016a_news_sector";

it("adds nullable sector columns and does not backfill", async () => {
  const queries: string[] = [];
  const db = {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      queries.push(new PgDialect().sqlToQuery(query).sql);
    },
  };
  await up({ db } as never);
  expect(queries[0]).toContain(
    'CREATE TABLE IF NOT EXISTS "app"."community_news_sector"',
  );
  expect(queries[0]).toContain('ADD COLUMN IF NOT EXISTS "sector" varchar(32)');
  expect(queries[0]).toContain(
    'CREATE INDEX IF NOT EXISTS "news_item_sector_idx"',
  );
  expect(queries[0]).not.toMatch(/NOT NULL|DEFAULT|INSERT INTO|UPDATE /i);
  await down({ db } as never);
  expect(queries[1]).toContain(
    'DROP TABLE IF EXISTS "app"."community_news_sector"',
  );
  expect(queries[1]).toContain('DROP COLUMN IF EXISTS "sector"');
});
