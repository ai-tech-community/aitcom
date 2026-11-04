// Prefix 20261104b. Registered after 20261104a_startup_profile_flags
// (#554) and 20261103a_datacenter_facility_planned_capacity. #553 has
// no migration file. Apply this one only after those.
//
// DDL only. Nullable columns, no default, no backfill. Existing rows stay
// unclaimed: claim_status remains null, so no profile becomes verified here.
// A verified badge is claim_status = 'approved', which only a later staff
// approval writes. ADD COLUMN without a default is metadata-only on
// Postgres 11+ and stays inside the deploy time limit.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      ADD COLUMN IF NOT EXISTS "claim_status" varchar(16),
      ADD COLUMN IF NOT EXISTS "claimed_by_user_id" varchar(255),
      ADD COLUMN IF NOT EXISTS "claimed_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "claim_draft" jsonb;

    DO $$ BEGIN
      ALTER TABLE "app"."startup"
        ADD CONSTRAINT "startup_claimed_by_user_id_fk"
        FOREIGN KEY ("claimed_by_user_id")
        REFERENCES "app"."user"("id")
        ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "app"."startup"
        ADD CONSTRAINT "startup_claim_status_check"
        CHECK (
          "claim_status" IS NULL
          OR "claim_status" IN ('pending', 'approved', 'rejected')
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE INDEX IF NOT EXISTS "startup_claim_status_idx"
      ON "app"."startup" USING btree ("claim_status");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."startup_claim_status_idx";
    ALTER TABLE "app"."startup" DROP CONSTRAINT IF EXISTS "startup_claim_status_check";
    ALTER TABLE "app"."startup" DROP CONSTRAINT IF EXISTS "startup_claimed_by_user_id_fk";
    ALTER TABLE "app"."startup"
      DROP COLUMN IF EXISTS "claim_draft",
      DROP COLUMN IF EXISTS "claimed_at",
      DROP COLUMN IF EXISTS "claimed_by_user_id",
      DROP COLUMN IF EXISTS "claim_status";
  `);
}
