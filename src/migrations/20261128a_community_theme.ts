// Community look choice. DDL only: a side table keyed by community, so the
// hot `community` row stays as it is and databases that skip this migration
// (preview builds) still load. No row means Plain, so there is no backfill.
// `theme_id` is checked against the catalog in code, not by a DB enum, so a
// new look needs no migration.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."community_theme" (
      "community_id" varchar(255) PRIMARY KEY
        REFERENCES "app"."community"("id") ON DELETE CASCADE,
      "theme_id" varchar(32) NOT NULL,
      "updated_by" varchar(255) REFERENCES "app"."user"("id") ON DELETE SET NULL,
      "updated_at" timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."community_theme";
  `);
}
