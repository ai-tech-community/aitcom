import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Append-only log of every XP award (one row per awardXp call), so we can show
 * a member's points history and an XP-over-time chart. Additive only — a
 * single CREATE TABLE IF NOT EXISTS, no data is dropped or altered.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."points_event" (
      "id" varchar(255) PRIMARY KEY,
      "user_id" varchar(255) NOT NULL,
      "amount" integer NOT NULL,
      "reason" varchar(50) NOT NULL,
      "total_after" integer,
      "metadata" json,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS "points_event_user_idx"
      ON "app"."points_event"("user_id");
    CREATE INDEX IF NOT EXISTS "points_event_user_created_idx"
      ON "app"."points_event"("user_id", "created_at");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."points_event";`);
}
