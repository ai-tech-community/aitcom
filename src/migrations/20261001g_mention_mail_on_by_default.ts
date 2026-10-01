// Mention emails go live, on by default (#391): a member mentioned in a
// post gets an email unless they turn it off.
//
// - hub_mail_pref.mention defaults to true. Stored rows keep their value:
//   a member who flipped any switch before this stored the old default
//   (mention off) without choosing it, and stays off. Production had no
//   stored rows when this shipped.
// - app.post_mention_mail_log records each mention email (one per member
//   per post, claimed before sending), apart from the in-app
//   notifications members can delete; the per-recipient limits count it.
//   post_id has no foreign key on purpose: the email can be claimed
//   while the post's own save is still uncommitted (outside a request),
//   and a record outliving its post is harmless.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."hub_mail_pref" ALTER COLUMN "mention" SET DEFAULT true;

    CREATE TABLE IF NOT EXISTS "app"."post_mention_mail_log" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "user_id" varchar(255) NOT NULL
        REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "post_id" integer NOT NULL,
      "author_id" varchar(255) NOT NULL,
      "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "post_mention_mail_log_uidx"
      ON "app"."post_mention_mail_log" USING btree ("user_id", "post_id");
    CREATE INDEX IF NOT EXISTS "post_mention_mail_log_user_created_idx"
      ON "app"."post_mention_mail_log" USING btree ("user_id", "created_at");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."post_mention_mail_log";
    ALTER TABLE "app"."hub_mail_pref" ALTER COLUMN "mention" SET DEFAULT false;
  `);
}
