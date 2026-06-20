import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Table backing the PointsBoosts Payload collection (admin-managed XP boost
 * campaigns). Payload-owned tables live in the default (public) schema with
 * integer serial ids. Additive only — CREATE TABLE IF NOT EXISTS, no drops.
 * In local dev the table may already exist via Payload push; IF NOT EXISTS
 * keeps this idempotent.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "points_boosts" (
      "id" serial PRIMARY KEY,
      "name" varchar NOT NULL,
      "multiplier" numeric DEFAULT 2 NOT NULL,
      "starts_at" timestamp(3) with time zone NOT NULL,
      "ends_at" timestamp(3) with time zone NOT NULL,
      "description" varchar,
      "cta_text" varchar,
      "cta_link" varchar,
      "enabled" boolean DEFAULT true,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE INDEX IF NOT EXISTS "points_boosts_updated_at_idx"
      ON "points_boosts" ("updated_at");
    CREATE INDEX IF NOT EXISTS "points_boosts_created_at_idx"
      ON "points_boosts" ("created_at");
    CREATE INDEX IF NOT EXISTS "points_boosts_active_idx"
      ON "points_boosts" ("enabled", "starts_at", "ends_at");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "points_boosts";`);
}
