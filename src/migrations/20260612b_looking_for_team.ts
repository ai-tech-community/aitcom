// Adds app.challenge_enrollment.looking_for_team_at: the "looking for a team"
// opt-in for hackathon teammate matching (#164). Set (timestamptz, doubles as
// list sort order) while a solo enrollment wants to appear on the list;
// cleared when the enrollment joins a team; list reads additionally gate on
// the hackathon's 'live' phase. DDL mirrors the Drizzle definition in
// src/server/db/schema.ts (challengeEnrollments.lookingForTeamAt). Fully
// idempotent (IF NOT EXISTS) so `payload migrate` reconciles as a safe no-op
// against a DB that already has the column.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."challenge_enrollment"
      ADD COLUMN IF NOT EXISTS "looking_for_team_at" timestamptz;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."challenge_enrollment"
      DROP COLUMN IF EXISTS "looking_for_team_at";
  `);
}
