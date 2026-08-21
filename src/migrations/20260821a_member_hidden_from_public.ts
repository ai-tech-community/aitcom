import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Staff-controlled public-roster hide flag. Does not delete user rows.
 * Backfill known junk / QA / the duplicate Soren Ravn (LVL 1) id. The
 * LVL 4 Soren Ravn row stays visible.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."member_profile"
      ADD COLUMN IF NOT EXISTS "hidden_from_public" boolean NOT NULL DEFAULT false;

    UPDATE "app"."member_profile"
    SET "hidden_from_public" = true
    WHERE "hidden_from_public" = false
      AND (
        "user_id" IN (
          'tBZwvwahpnlGRTJ1crG42f9HYfe0ZQV7',
          'W0aniPJoK3xsV2pbuxRekvElvbf3mbKe',
          'JnZ622Cyf9K3NiqHIoA4lL9XtN9cJMca',
          'j0vb7bdLmBEERecZmiQ5ytYEqltLoFFX',
          'qTXhAdPZEpmpYLCAEUs7lGTIsnSfGyDZ',
          'DSjyTaGswyYusg5kDyqvKq4OLg9IN0oP'
        )
        OR lower(btrim("display_name")) IN (
          'dev user',
          'review bot 3002',
          '445983370-cmd',
          'qa human',
          'qa fuse'
        )
      );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."member_profile"
      DROP COLUMN IF EXISTS "hidden_from_public";
  `);
}
