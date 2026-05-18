import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * BYOA reshape of `benchmark_assignment` (ADR-0006 + ADR-0008 Step 5):
 *
 * - Add `model_surface` so an assignment can pin which surface the
 *   contributor should use; ManualRunForm pre-fills from this when
 *   launched from inside an assignment.
 * - Add `expires_at` so held assignments time out and return their
 *   prompts to the virtual open pool. Default 7 days for new rows.
 * - Rename status `active` → `held` to match the BYOA vocabulary
 *   (the contributor *holds* the assignment; AIT does not *run* it).
 *   New terminal status `expired` covers both timed-out holds and
 *   explicit releases.
 *
 * Open assignments are *not* stored — they are derived on-the-fly from
 * coverage gaps. Only held / completed / expired rows live here.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."benchmark_assignment"
      ADD COLUMN IF NOT EXISTS "model_surface" "app"."model_surface",
      ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;

    UPDATE "app"."benchmark_assignment"
      SET "status" = 'held',
          "expires_at" = COALESCE("expires_at", "created_at" + INTERVAL '7 days')
      WHERE "status" = 'active';

    CREATE INDEX IF NOT EXISTS "benchmark_assignment_status_expires_idx"
      ON "app"."benchmark_assignment"("status", "expires_at");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "app"."benchmark_assignment"
      SET "status" = 'active'
      WHERE "status" = 'held';

    DROP INDEX IF EXISTS "app"."benchmark_assignment_status_expires_idx";

    ALTER TABLE "app"."benchmark_assignment"
      DROP COLUMN IF EXISTS "expires_at",
      DROP COLUMN IF EXISTS "model_surface";
  `);
}
