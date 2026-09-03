import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Hub notification-mail prefs + DM ping ledger.
 * Defaults: DM on, mention/forum/digest/agent off. Absence of a prefs row
 * is treated as those defaults, so existing members are not seeded.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."hub_mail_pref" (
      "user_id" varchar(255) PRIMARY KEY NOT NULL REFERENCES "app"."user"("id"),
      "dm" boolean DEFAULT true NOT NULL,
      "mention" boolean DEFAULT false NOT NULL,
      "forum_reply" boolean DEFAULT false NOT NULL,
      "digest" boolean DEFAULT false NOT NULL,
      "agent_job" boolean DEFAULT false NOT NULL,
      "updated_at" timestamptz
    );

    CREATE TABLE IF NOT EXISTS "app"."hub_dm_mail_log" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "conversation_id" varchar(255) NOT NULL REFERENCES "app"."conversation"("id"),
      "unread_anchor" varchar(40) NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "hub_dm_mail_log_uidx"
      ON "app"."hub_dm_mail_log" USING btree ("user_id", "conversation_id", "unread_anchor");
    CREATE INDEX IF NOT EXISTS "hub_dm_mail_log_user_idx"
      ON "app"."hub_dm_mail_log" USING btree ("user_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."hub_dm_mail_log";
    DROP TABLE IF EXISTS "app"."hub_mail_pref";
  `);
}
