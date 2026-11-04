import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import { down, up } from "./20261104a_startup_profile_flags";

const NAME = "20261104a_startup_profile_flags";

it("adds cofounder and hiring flags as DDL with a false default", async () => {
  const queries: string[] = [];
  const db = {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      queries.push(new PgDialect().sqlToQuery(query).sql);
    },
  };
  await up({ db } as never);
  const sql = queries.join("\n");
  expect(sql).toContain('ALTER TABLE "app"."startup"');
  expect(sql).toContain(
    'ADD COLUMN IF NOT EXISTS "looking_for_cofounder" boolean NOT NULL DEFAULT false',
  );
  expect(sql).toContain(
    'ADD COLUMN IF NOT EXISTS "hiring" boolean NOT NULL DEFAULT false',
  );
  expect(sql).not.toMatch(/\bINSERT INTO\b|\bUPDATE\b|\bDELETE FROM\b/i);

  await down({ db } as never);
  const rollback = queries[queries.length - 1] ?? "";
  expect(rollback).toContain('DROP COLUMN IF EXISTS "looking_for_cofounder"');
  expect(rollback).toContain('DROP COLUMN IF EXISTS "hiring"');

  const index = readFileSync(
    join(process.cwd(), "src/migrations/index.ts"),
    "utf8",
  );
  expect(index).toContain(`name: "${NAME}"`);
});
