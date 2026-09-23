// Denormalized sourced open-role count on startup. 0 after a live empty scan.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      ADD COLUMN IF NOT EXISTS "open_role_count" integer NOT NULL DEFAULT 0;
  `);

  await db.execute(sql`
    UPDATE "app"."startup" AS s
    SET "open_role_count" = (
      SELECT COUNT(*)::int
      FROM "app"."startup_role" AS r
      WHERE r."startup_id" = s."id"
        AND r."status" = 'open'
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      DROP COLUMN IF EXISTS "open_role_count";
  `);
}
