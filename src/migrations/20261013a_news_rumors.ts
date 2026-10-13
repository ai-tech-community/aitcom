// Member-submitted rumors on /news. Idempotent.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."news_rumor" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "submitter_name" text NOT NULL,
      "title" text NOT NULL,
      "url" text,
      "body" text NOT NULL,
      "hidden_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "news_rumor_created_idx"
      ON "app"."news_rumor" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "news_rumor_user_created_idx"
      ON "app"."news_rumor" USING btree ("user_id", "created_at");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."news_rumor";
  `);
}
