// Data collectors: a stable, translatable failure detail next to the English
// `error` sentence, so the member's screen can say why a run failed in the
// member's language. Additive and nullable: older failed runs have none.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."collector_run"
      ADD COLUMN IF NOT EXISTS "error_detail" jsonb;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."collector_run" DROP COLUMN IF EXISTS "error_detail";
  `);
}
