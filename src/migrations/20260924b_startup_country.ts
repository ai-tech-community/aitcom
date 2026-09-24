// ISO country of the sourced region, resolved at write time. Existing rows
// are filled by `pnpm db:backfill-startup-countries`
// (src/server/startups/backfill-countries.ts): geocoder calls do not belong
// in a deploy-time migration.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      ADD COLUMN IF NOT EXISTS "country" varchar(2);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      DROP COLUMN IF EXISTS "country";
  `);
}
