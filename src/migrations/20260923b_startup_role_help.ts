// Link a member's role-help question to the community forum thread it created.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."startup_role_help" (
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "role_id" varchar(255) NOT NULL REFERENCES "app"."startup_role"("id") ON DELETE CASCADE,
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id") ON DELETE CASCADE,
      "note" text NOT NULL,
      "classroom_title" text NOT NULL DEFAULT '',
      "classroom_slug" text NOT NULL DEFAULT '',
      "thread_id" integer NOT NULL,
      "thread_slug" text NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamptz,
      PRIMARY KEY ("user_id", "role_id", "community_id")
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."startup_role_help";
  `);
}
