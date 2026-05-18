import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Under BYOA (ADR-0006) contributors paste the raw answer from their own
 * AI product session. They generally do not know the specific model id /
 * SKU their app shipped this week, and `model_surface` is the primary
 * slicing key per ADR-0001/ADR-0004. Make `model_id` nullable so the
 * submission form can keep it as an optional forensic field.
 *
 * See [[adr-0006-byoa-community-executes-ait-collects]] and the BYOA
 * rebuild plan, Step 1.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."benchmark_run"
      ALTER COLUMN "model_id" DROP NOT NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."benchmark_run"
      ALTER COLUMN "model_id" SET NOT NULL;
  `);
}
