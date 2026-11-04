import { expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import { up, down } from "./20261104b_startup_claim";

it("adds nullable claim columns and does not backfill or verify rows", async () => {
  const queries: string[] = [];
  const db = {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      queries.push(new PgDialect().sqlToQuery(query).sql);
    },
  };
  await up({ db } as never);
  expect(queries[0]).toContain('ALTER TABLE "app"."startup"');
  expect(queries[0]).toContain(
    'ADD COLUMN IF NOT EXISTS "claim_status" varchar(16)',
  );
  expect(queries[0]).toContain(
    'ADD COLUMN IF NOT EXISTS "claimed_by_user_id" varchar(255)',
  );
  expect(queries[0]).toContain(
    'ADD COLUMN IF NOT EXISTS "claimed_at" timestamptz',
  );
  expect(queries[0]).toContain('ADD COLUMN IF NOT EXISTS "claim_draft" jsonb');
  expect(queries[0]).toContain("startup_claimed_by_user_id_fk");
  expect(queries[0]).toContain('REFERENCES "app"."user"("id")');
  expect(queries[0]).toContain("ON DELETE SET NULL");
  expect(queries[0]).toContain("startup_claim_status_check");
  expect(queries[0]).toContain("'pending'");
  expect(queries[0]).toContain("'approved'");
  expect(queries[0]).toContain("'rejected'");
  expect(queries[0]).toContain(
    'CREATE INDEX IF NOT EXISTS "startup_claim_status_idx"',
  );
  expect(queries[0]).not.toMatch(/NOT NULL|DEFAULT|INSERT INTO|UPDATE /i);
  await down({ db } as never);
  expect(queries[1]).toContain(
    'DROP INDEX IF EXISTS "app"."startup_claim_status_idx"',
  );
  expect(queries[1]).toContain('DROP COLUMN IF EXISTS "claim_status"');
});
