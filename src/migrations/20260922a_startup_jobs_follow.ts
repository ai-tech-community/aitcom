// Private saved job searches and private "I'm applying" marks.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."startup_jobs_follow" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "company" text NOT NULL DEFAULT '',
      "q" text NOT NULL DEFAULT '',
      "location" text NOT NULL DEFAULT '',
      "work_type" text NOT NULL DEFAULT '',
      "last_seen_at" timestamptz NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "startup_jobs_follow_query_idx"
      ON "app"."startup_jobs_follow" ("user_id", "company", "q", "location", "work_type");

    CREATE INDEX IF NOT EXISTS "startup_jobs_follow_user_idx"
      ON "app"."startup_jobs_follow" ("user_id");

    CREATE TABLE IF NOT EXISTS "app"."startup_role_application" (
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "role_id" varchar(255) NOT NULL REFERENCES "app"."startup_role"("id") ON DELETE CASCADE,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      PRIMARY KEY ("user_id", "role_id")
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."startup_role_application";
    DROP TABLE IF EXISTS "app"."startup_jobs_follow";
  `);
}
