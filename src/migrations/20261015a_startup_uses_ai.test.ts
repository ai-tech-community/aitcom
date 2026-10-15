import { expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import { up, down } from "./20261015a_startup_uses_ai";

it("adds a nullable uses_ai column and does not backfill", async () => {
  const queries: string[] = [];
  const db = {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      queries.push(new PgDialect().sqlToQuery(query).sql);
    },
  };
  await up({ db } as never);
  expect(queries[0]).toContain('ALTER TABLE "app"."startup"');
  expect(queries[0]).toContain('ADD COLUMN IF NOT EXISTS "uses_ai" boolean');
  expect(queries[0]).toContain(
    'CREATE INDEX IF NOT EXISTS "startup_uses_ai_idx"',
  );
  expect(queries[0]).not.toMatch(/NOT NULL|DEFAULT|INSERT INTO|UPDATE /i);
  await down({ db } as never);
  expect(queries[1]).toContain(
    'DROP INDEX IF EXISTS "app"."startup_uses_ai_idx"',
  );
  expect(queries[1]).toContain('DROP COLUMN IF EXISTS "uses_ai"');
});
