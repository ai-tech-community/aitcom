// Adds app.member_profile.onboarding_dismissed_at: the account-level
// "don't show again" for the getting-started checklist (dashboard card and
// the site-wide reminder). Replaces a browser-only localStorage flag so the
// choice holds on every device. Nullable timestamptz, no default: existing
// rows stay null = "still shown". Mirrors the Drizzle column
// memberProfiles.onboardingDismissedAt (`.timestamp({ withTimezone: true })`).
// Idempotent (ADD/DROP COLUMN IF EXISTS) so a re-run is a safe no-op.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."member_profile"
      ADD COLUMN IF NOT EXISTS "onboarding_dismissed_at" timestamptz;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."member_profile"
      DROP COLUMN IF EXISTS "onboarding_dismissed_at";
  `);
}
