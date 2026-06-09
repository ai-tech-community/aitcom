// Adds the team submission + judging columns (Plan 2, ADR-0029): the captain's
// submission freeze (submitted_at + optional artifact) and the sponsor's
// finalize output (score, final_rank, prize_awarded_at). Idempotent; mirrors the
// Drizzle defs in src/server/db/schema.ts.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."team" ADD COLUMN IF NOT EXISTS "submitted_at" timestamptz;
    ALTER TABLE "app"."team" ADD COLUMN IF NOT EXISTS "artifact_url" varchar(2048);
    ALTER TABLE "app"."team" ADD COLUMN IF NOT EXISTS "artifact_summary" text;
    ALTER TABLE "app"."team" ADD COLUMN IF NOT EXISTS "score" integer;
    ALTER TABLE "app"."team" ADD COLUMN IF NOT EXISTS "final_rank" integer;
    ALTER TABLE "app"."team" ADD COLUMN IF NOT EXISTS "prize_awarded_at" timestamptz;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."team" DROP COLUMN IF EXISTS "prize_awarded_at";
    ALTER TABLE "app"."team" DROP COLUMN IF EXISTS "final_rank";
    ALTER TABLE "app"."team" DROP COLUMN IF EXISTS "score";
    ALTER TABLE "app"."team" DROP COLUMN IF EXISTS "artifact_summary";
    ALTER TABLE "app"."team" DROP COLUMN IF EXISTS "artifact_url";
    ALTER TABLE "app"."team" DROP COLUMN IF EXISTS "submitted_at";
  `);
}
