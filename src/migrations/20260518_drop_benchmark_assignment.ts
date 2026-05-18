import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Drop the obsolete benchmark_assignment table and the
 * benchmark_run.assignment_id column. The assignment flow is replaced by
 * AIT-mediated proxy runs and the autonomous queue (ADR-0002, ADR-0005).
 *
 * The down migration recreates the table and column shape but does not
 * restore any data — by the time this lands no production assignments
 * existed.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."benchmark_run_assignment_idx";

    ALTER TABLE "app"."benchmark_run"
      DROP COLUMN IF EXISTS "assignment_id";
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."benchmark_assignment" CASCADE;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."benchmark_assignment" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" text NOT NULL,
      "agent_id" uuid,
      "prompt_ids" uuid[] NOT NULL,
      "model_provider" text,
      "model_id" text,
      "locale" text NOT NULL DEFAULT 'en-US',
      "status" text NOT NULL DEFAULT 'active',
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completed_at" timestamp with time zone
    );

    CREATE INDEX IF NOT EXISTS "benchmark_assignment_user_status_idx"
      ON "app"."benchmark_assignment"("user_id", "status");

    CREATE INDEX IF NOT EXISTS "benchmark_assignment_agent_idx"
      ON "app"."benchmark_assignment"("agent_id");
  `);

  await db.execute(sql`
    ALTER TABLE "app"."benchmark_run"
      ADD COLUMN IF NOT EXISTS "assignment_id" uuid
        REFERENCES "app"."benchmark_assignment"("id") ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS "benchmark_run_assignment_idx"
      ON "app"."benchmark_run"("assignment_id");
  `);
}
