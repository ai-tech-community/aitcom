// Private extracted CV text for member startup applications. One row per user.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."startup_member_cv" (
      "user_id" varchar(255) PRIMARY KEY NOT NULL REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "file_name" text NOT NULL,
      "mime_type" varchar(128) NOT NULL,
      "text_content" text NOT NULL,
      "purpose" varchar(64) NOT NULL DEFAULT 'startup_role_applications',
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamptz
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."startup_member_cv";
  `);
}
