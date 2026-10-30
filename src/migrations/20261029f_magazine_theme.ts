// Per-magazine editorial theme. DDL only: two nullable columns. A magazine
// with neither set keeps the default journal pair at read time, so this
// migration writes no rows.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "magazines"
      ADD COLUMN IF NOT EXISTS "theme_font_pair" varchar;
    ALTER TABLE "magazines"
      ADD COLUMN IF NOT EXISTS "theme_accent" varchar;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "magazines" DROP COLUMN IF EXISTS "theme_accent";
    ALTER TABLE "magazines" DROP COLUMN IF EXISTS "theme_font_pair";
  `);
}
