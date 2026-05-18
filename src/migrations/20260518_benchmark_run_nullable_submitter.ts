import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Auto-seeded proxy rows have no human submitter. Make
 * `submitted_by_user_id` nullable; the FK constraint stays in place and
 * NULL is allowed by FK semantics. Contributor-submitted rows continue to
 * populate it as before.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."benchmark_run"
      ALTER COLUMN "submitted_by_user_id" DROP NOT NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Reverting requires backfilling NULLs to something. Use the empty
  // string sentinel only when no rows have NULL submitter; otherwise the
  // down migration will fail and the operator can decide how to repair.
  await db.execute(sql`
    ALTER TABLE "app"."benchmark_run"
      ALTER COLUMN "submitted_by_user_id" SET NOT NULL;
  `);
}
