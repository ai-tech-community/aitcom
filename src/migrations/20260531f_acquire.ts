import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."community_acquire_config" (
      "community_id" varchar(255) PRIMARY KEY NOT NULL REFERENCES "app"."community"("id"),
      "cross_promote" boolean DEFAULT true NOT NULL,
      "referrals_enabled" boolean DEFAULT true NOT NULL,
      "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "app"."referral_credit" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "referrer_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "referred_user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "xp_awarded" integer NOT NULL,
      "credited_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "referral_credit_referred_uidx" ON "app"."referral_credit" ("referred_user_id");
    CREATE INDEX IF NOT EXISTS "referral_credit_referrer_idx" ON "app"."referral_credit" USING btree ("referrer_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."referral_credit";
    DROP TABLE IF EXISTS "app"."community_acquire_config";
  `);
}
