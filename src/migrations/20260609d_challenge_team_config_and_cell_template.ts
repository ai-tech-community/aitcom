import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

// Backing schema for the Challenges collection's `teamConfig` group and
// `cellTemplate` array (added with the hackathon layer, ADR-0029, but never
// migrated). Without these, Payload's generated INSERT/SELECT for `challenges`
// references columns/tables that don't exist, so every hackathon challenge
// write — and any read that LEFT JOINs the array table — fails. Mirrors the
// existing `challenges_objectives` array table exactly. Purely additive.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- teamConfig group → flat numeric columns on the challenges table
    ALTER TABLE "challenges"
      ADD COLUMN IF NOT EXISTS "team_config_min_team_size" numeric DEFAULT 1;
    ALTER TABLE "challenges"
      ADD COLUMN IF NOT EXISTS "team_config_max_team_size" numeric DEFAULT 5;

    -- cellTemplate array → its own child table (Payload convention), plus the
    -- verificationMode select enum.
    DO $$ BEGIN
      CREATE TYPE "enum_challenges_cell_template_verification_mode" AS ENUM(
        'platform-action', 'test', 'self-report', 'peer-review', 'consensus'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS "challenges_cell_template" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "description" varchar NOT NULL,
      "task_type" varchar NOT NULL,
      "verification_mode" "enum_challenges_cell_template_verification_mode" DEFAULT 'self-report' NOT NULL,
      "deadline_minutes" numeric DEFAULT 60 NOT NULL
    );

    DO $$ BEGIN
      ALTER TABLE "challenges_cell_template"
        ADD CONSTRAINT "challenges_cell_template_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "challenges"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE INDEX IF NOT EXISTS "challenges_cell_template_order_idx"
      ON "challenges_cell_template" ("_order");
    CREATE INDEX IF NOT EXISTS "challenges_cell_template_parent_id_idx"
      ON "challenges_cell_template" ("_parent_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "challenges_cell_template";
    DROP TYPE IF EXISTS "enum_challenges_cell_template_verification_mode";
    ALTER TABLE "challenges" DROP COLUMN IF EXISTS "team_config_min_team_size";
    ALTER TABLE "challenges" DROP COLUMN IF EXISTS "team_config_max_team_size";
  `);
}
