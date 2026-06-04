// Creates the four work-grid / commission tables (ADR-0022, ADR-0023). DDL is
// the canonical record of the slice-1 Drizzle definitions in
// src/server/db/schema.ts (agentCommissions, workGrids, workCells,
// workCellResults). Fully idempotent (CREATE TABLE / INDEX ... IF NOT EXISTS) so
// running `payload migrate` reconciles it as a safe no-op against a DB that
// already has the tables. Column types mirror the Drizzle output exactly:
// `.json()` → json (not jsonb), `.timestamp({ withTimezone: true })` → timestamptz,
// varchar(255) ids with snake_case column names per drizzle.config casing.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."agent_commission" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "owner_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "agent_id" varchar(255) NOT NULL REFERENCES "app"."agent_profile"("id"),
      "task_type_allowlist" json DEFAULT '[]'::json NOT NULL,
      "source_scope" varchar(40) DEFAULT 'enrolled-challenges' NOT NULL,
      "revoked_at" timestamptz,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "agent_commission_owner_idx"
      ON "app"."agent_commission" ("owner_id");
    CREATE INDEX IF NOT EXISTS "agent_commission_agent_idx"
      ON "app"."agent_commission" ("agent_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "agent_commission_owner_agent_uidx"
      ON "app"."agent_commission" ("owner_id", "agent_id");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."work_grid" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "challenge_id" integer,
      "community_id" varchar(255),
      "mode" varchar(20) DEFAULT 'collaborative' NOT NULL,
      "status" varchar(20) DEFAULT 'active' NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "work_grid_challenge_idx"
      ON "app"."work_grid" ("challenge_id");
    CREATE INDEX IF NOT EXISTS "work_grid_status_idx"
      ON "app"."work_grid" ("status");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."work_cell" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "grid_id" varchar(255) NOT NULL REFERENCES "app"."work_grid"("id"),
      "task_type" varchar(40) NOT NULL,
      "verification_mode" varchar(20) DEFAULT 'self-report' NOT NULL,
      "status" varchar(20) DEFAULT 'pending' NOT NULL,
      "claimed_by" varchar(255) REFERENCES "app"."agent_profile"("id"),
      "claimed_at" timestamptz,
      "deadline" timestamptz,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "work_cell_grid_idx"
      ON "app"."work_cell" ("grid_id");
    CREATE INDEX IF NOT EXISTS "work_cell_status_idx"
      ON "app"."work_cell" ("status");
    CREATE INDEX IF NOT EXISTS "work_cell_claimed_by_idx"
      ON "app"."work_cell" ("claimed_by");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."work_cell_result" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "cell_id" varchar(255) NOT NULL REFERENCES "app"."work_cell"("id"),
      "agent_id" varchar(255) NOT NULL REFERENCES "app"."agent_profile"("id"),
      "output" text,
      "verification_outcome" varchar(20) DEFAULT 'pending' NOT NULL,
      "verification_details" json,
      "submitted_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "verified_at" timestamptz
    );
    CREATE INDEX IF NOT EXISTS "work_cell_result_cell_idx"
      ON "app"."work_cell_result" ("cell_id");
    CREATE INDEX IF NOT EXISTS "work_cell_result_agent_idx"
      ON "app"."work_cell_result" ("agent_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "work_cell_result_cell_agent_uidx"
      ON "app"."work_cell_result" ("cell_id", "agent_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."work_cell_result";`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."work_cell";`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."work_grid";`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."agent_commission";`);
}
