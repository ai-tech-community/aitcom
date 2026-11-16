import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * What a message carries besides its words, one row per item in send
 * order. A `gif` row holds only the addresses the server read from GIPHY by
 * id (GIFs are never copied to our storage); `photo` rows come later.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."message_attachment" (
      "id" varchar(255) PRIMARY KEY,
      "message_id" varchar(255) NOT NULL REFERENCES "app"."message"("id") ON DELETE CASCADE,
      "position" smallint NOT NULL DEFAULT 0,
      "kind" varchar(10) NOT NULL,
      "giphy_id" varchar(64), "title" text, "mp4_url" text, "still_url" text,
      "width" integer, "height" integer,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "message_attachment_message_position_uniq" UNIQUE ("message_id", "position"),
      CONSTRAINT "message_attachment_kind_chk" CHECK ("kind" IN ('gif', 'photo')),
      CONSTRAINT "message_attachment_gif_fields_chk" CHECK (
        "kind" <> 'gif' OR ("giphy_id" IS NOT NULL AND "mp4_url" IS NOT NULL AND "still_url" IS NOT NULL)
      )
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."message_attachment";
  `);
}
