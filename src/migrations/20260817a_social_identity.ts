import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Verified GitHub / LinkedIn identities bound from OAuth accounts.
 * Pasted profile URLs on member_profile stay as optional unverified links.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."social_identity" (
      "id" varchar(255) PRIMARY KEY,
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "provider" varchar(32) NOT NULL,
      "provider_account_id" varchar(255) NOT NULL,
      "handle" varchar(255),
      "profile_url" varchar(512),
      "verified_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp with time zone
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "social_identity_user_provider_uidx"
      ON "app"."social_identity"("user_id", "provider");
    CREATE UNIQUE INDEX IF NOT EXISTS "social_identity_provider_account_uidx"
      ON "app"."social_identity"("provider", "provider_account_id");
    CREATE INDEX IF NOT EXISTS "social_identity_user_idx"
      ON "app"."social_identity"("user_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."social_identity";`);
}
