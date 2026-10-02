// Showcase pinning on the member profile (ADR-0039, slice 4). Additive:
//
// - member_profile.showcase_badges: the badge slugs the member pinned to
//   their profile's showcase, in pin order. Empty means "nothing pinned":
//   the profile then shows the member's three rarest badges.
// - A CHECK caps it at three, so the limit holds even if a writer skips
//   the procedure's validation.
//
// A constant default adds the column without rewriting the table
// (Postgres 11+), and every statement is guarded, so a re-run is a no-op.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."member_profile"
      ADD COLUMN IF NOT EXISTS "showcase_badges" text[] DEFAULT '{}'::text[] NOT NULL;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'member_profile_showcase_badges_max'
          AND conrelid = '"app"."member_profile"'::regclass
      ) THEN
        ALTER TABLE "app"."member_profile"
          ADD CONSTRAINT "member_profile_showcase_badges_max"
          CHECK (cardinality("showcase_badges") <= 3);
      END IF;
    END $$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."member_profile"
      DROP CONSTRAINT IF EXISTS "member_profile_showcase_badges_max";
    ALTER TABLE "app"."member_profile"
      DROP COLUMN IF EXISTS "showcase_badges";
  `);
}
