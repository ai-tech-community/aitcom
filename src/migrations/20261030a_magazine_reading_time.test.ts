// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { up, down } from "./20261030a_magazine_reading_time";
it("prepares an additive bounded session table with cascading page references and registration", async () => {
  const execute = vi.fn();
  await up({ db: { execute } } as unknown as MigrateUpArgs);
  const statement = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]).sql;
  expect(statement).toContain(
    'CREATE TABLE IF NOT EXISTS "app"."magazine_reading_session"',
  );
  expect(statement.match(/ON DELETE cascade/g)).toHaveLength(3);
  expect(statement).toContain('"id" uuid PRIMARY KEY');
  expect(statement).toContain('"active_seconds" BETWEEN 0 AND 7200');
  expect(statement).toContain("CREATE INDEX IF NOT EXISTS");
  expect(statement).not.toMatch(/\b(INSERT|UPDATE|DELETE FROM)\b/);
  const registry = readFileSync("src/migrations/index.ts", "utf8");
  expect(registry).toContain('name: "20261030a_magazine_reading_time"');
  await down({ db: { execute } } as unknown as MigrateDownArgs);
  expect(new PgDialect().sqlToQuery(execute.mock.calls[1]![0]).sql).toContain(
    'DROP TABLE IF EXISTS "app"."magazine_reading_session"',
  );
});
