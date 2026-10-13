// e27 answered during the October feed check and then failed in production.
// One indexed delete. The cron only inserts URLs still listed in code, so
// removing the row stops the fetch. Story tables are not touched.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."news_feed"
    WHERE "url" = 'https://e27.co/feed/';
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    INSERT INTO "app"."news_feed" ("id", "name", "url", "enabled")
    VALUES ('e27', 'e27', 'https://e27.co/feed/', true)
    ON CONFLICT ("url") DO NOTHING;
  `);
}
