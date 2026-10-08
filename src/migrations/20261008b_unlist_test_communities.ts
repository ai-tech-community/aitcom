// Hides the test communities xxx-ai and demo-community from the public
// directory, the homepage Featured strip, and sitemap.xml by marking them
// unlisted (`app.community.is_listed_in_directory`). Does not delete the
// row or anything under it. Members and owners still open the community by
// its URL. A missing slug updates nothing. Idempotent.
//
// The column is boolean, not an enum: `false` is a bare literal, with no
// Postgres cast. This statement does not touch locales.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "app"."community"
    SET
      "is_listed_in_directory" = false,
      "updated_at" = NOW()
    WHERE "slug" IN ('xxx-ai', 'demo-community')
      AND "is_listed_in_directory" = true;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "app"."community"
    SET
      "is_listed_in_directory" = true,
      "updated_at" = NOW()
    WHERE "slug" IN ('xxx-ai', 'demo-community')
      AND "is_listed_in_directory" = false;
  `);
}
