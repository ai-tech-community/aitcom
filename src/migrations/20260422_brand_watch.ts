import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "app"."brand_watch" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" text NOT NULL,
      "brand_id" uuid NOT NULL REFERENCES "app"."brand"("id") ON DELETE CASCADE,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "last_notified_at" timestamp with time zone,
      CONSTRAINT "brand_watch_user_brand_uq" UNIQUE ("user_id", "brand_id")
    );
    CREATE INDEX "brand_watch_user_idx" ON "app"."brand_watch"("user_id");
    CREATE INDEX "brand_watch_brand_idx" ON "app"."brand_watch"("brand_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."brand_watch" CASCADE;`);
}
