import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Community Spaces Plan 2a — rooms. Adds `visibility` to space, a nullable
 * `space_id` seam to conversation (type='space' rooms), and the
 * space_membership table. Additive + idempotent; applied via `pnpm db:apply`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."space" ADD COLUMN IF NOT EXISTS "visibility" varchar(10);
    ALTER TABLE "app"."conversation" ADD COLUMN IF NOT EXISTS "space_id" varchar(255) REFERENCES "app"."space"("id");
    CREATE TABLE IF NOT EXISTS "app"."space_membership" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "space_id" varchar(255) NOT NULL REFERENCES "app"."space"("id"),
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "role" varchar(20) NOT NULL DEFAULT 'member',
      "status" varchar(30) NOT NULL DEFAULT 'active',
      "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "space_membership_space_user_uidx" ON "app"."space_membership" ("space_id", "user_id");
    CREATE INDEX IF NOT EXISTS "space_membership_user_idx" ON "app"."space_membership" ("user_id");
    CREATE INDEX IF NOT EXISTS "space_membership_space_status_idx" ON "app"."space_membership" ("space_id", "status");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."space_membership";
    ALTER TABLE "app"."conversation" DROP COLUMN IF EXISTS "space_id";
    ALTER TABLE "app"."space" DROP COLUMN IF EXISTS "visibility";
  `);
}
