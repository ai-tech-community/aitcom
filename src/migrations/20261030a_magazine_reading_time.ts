import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."magazine_reading_session" (
      "id" uuid PRIMARY KEY,
      "magazine_id" integer NOT NULL REFERENCES "public"."magazines"("id") ON DELETE cascade,
      "issue_id" integer NOT NULL REFERENCES "public"."magazine_issues"("id") ON DELETE cascade,
      "article_id" integer REFERENCES "public"."articles"("id") ON DELETE cascade,
      "active_seconds" integer NOT NULL DEFAULT 0,
      "first_seen_at" timestamptz NOT NULL,
      "last_seen_at" timestamptz NOT NULL,
      CONSTRAINT "magazine_reading_session_seconds_check" CHECK ("active_seconds" BETWEEN 0 AND 7200)
    );
    CREATE INDEX IF NOT EXISTS "magazine_reading_session_magazine_idx"
      ON "app"."magazine_reading_session" ("magazine_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."magazine_reading_session";`);
}
