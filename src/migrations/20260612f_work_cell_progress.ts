// Adds app.work_cell.progress_status + progress_note: the manual, kanban-style
// task progress (todo/in_progress/blocked/done) teams set by hand, alongside —
// and never affecting — the verification pipeline that drives scoring
// (ADR-0029). DDL mirrors the Drizzle definition in src/server/db/schema.ts
// (workCells.progressStatus/progressNote). Fully idempotent (IF NOT EXISTS) so
// `payload migrate` reconciles as a safe no-op against a DB that already has
// the columns; existing rows backfill to 'todo' via the column DEFAULT.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."work_cell"
      ADD COLUMN IF NOT EXISTS "progress_status" varchar(20) NOT NULL DEFAULT 'todo';
    ALTER TABLE "app"."work_cell"
      ADD COLUMN IF NOT EXISTS "progress_note" text;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."work_cell" DROP COLUMN IF EXISTS "progress_note";
    ALTER TABLE "app"."work_cell" DROP COLUMN IF EXISTS "progress_status";
  `);
}
