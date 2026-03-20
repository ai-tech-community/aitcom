import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql`ALTER TABLE app.benchmark_run ADD COLUMN IF NOT EXISTS model_id TEXT;`
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`ALTER TABLE app.benchmark_run DROP COLUMN IF EXISTS model_id;`
  );
}
