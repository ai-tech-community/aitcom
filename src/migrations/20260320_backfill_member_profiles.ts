import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Create a member_profile for every user that doesn't have one yet.
  // Uses the user's name (or email prefix) as displayName.
  await db.execute(
    sql`
      INSERT INTO app.member_profile (user_id, display_name, is_public, xp, level, onboarding_completed, skills, created_at)
      SELECT
        u.id,
        COALESCE(NULLIF(u.name, ''), SPLIT_PART(u.email, '@', 1)),
        TRUE,
        0,
        1,
        FALSE,
        '[]'::json,
        NOW()
      FROM app."user" u
      LEFT JOIN app.member_profile mp ON mp.user_id = u.id
      WHERE mp.user_id IS NULL;
    `,
  );
}

export async function down({ db: _db }: MigrateDownArgs): Promise<void> {
  // No-op: we don't want to delete profiles that may have been updated since backfill.
}
