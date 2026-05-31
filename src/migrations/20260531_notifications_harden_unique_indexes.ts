import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- one global opt-out row per (user, category)
    CREATE UNIQUE INDEX IF NOT EXISTS "notification_optout_global_uidx"
      ON "app"."notification_optout" ("user_id", "category")
      WHERE "community_id" IS NULL;
    -- one per-community opt-out row per (user, community, category)
    CREATE UNIQUE INDEX IF NOT EXISTS "notification_optout_scoped_uidx"
      ON "app"."notification_optout" ("user_id", "community_id", "category")
      WHERE "community_id" IS NOT NULL;
    -- one transactional reminder per (user, dedupe_key); promotional rows (dedupe_key NULL) unconstrained
    DROP INDEX IF EXISTS "app"."broadcast_delivery_user_dedupe_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "broadcast_delivery_dedupe_uidx"
      ON "app"."broadcast_delivery" ("user_id", "dedupe_key")
      WHERE "dedupe_key" IS NOT NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."notification_optout_global_uidx";
    DROP INDEX IF EXISTS "app"."notification_optout_scoped_uidx";
    DROP INDEX IF EXISTS "app"."broadcast_delivery_dedupe_uidx";
    CREATE INDEX IF NOT EXISTS "broadcast_delivery_user_dedupe_idx"
      ON "app"."broadcast_delivery" ("user_id", "dedupe_key");
  `);
}
