// Interrupted automatic drafts retain their last issue write; history retains
// whether its actor was a person even after that person's account is deleted.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."magazine_auto_draft_run"
      ADD COLUMN IF NOT EXISTS "last_write_at" timestamptz;
    ALTER TABLE "app"."magazine_issue_history"
      ADD COLUMN IF NOT EXISTS "actor_kind" varchar(16);

    -- An existing person id proves personhood. With a missing id, only known
    -- system-only paths prove automation: scheduled/event assembly, automatic
    -- publication, and failed automatic publishing. Everything else stays a
    -- person (possibly a deleted account) rather than being attributed falsely
    -- to the magazine. New writes explicitly set the kind before account loss.
    UPDATE "app"."magazine_issue_history"
    SET "actor_kind" = CASE
      WHEN "actor_id" IS NOT NULL THEN 'person'
      WHEN "event" IN ('draft_made', 'draft_skipped')
        AND "detail"->>'trigger' IN ('schedule', 'event') THEN 'automatic'
      WHEN "event" = 'published' AND "origin" = 'auto' THEN 'automatic'
      WHEN "event" = 'auto_publish_stopped'
        AND "detail"->>'why' = 'failed' THEN 'automatic'
      ELSE 'person'
    END
    WHERE "actor_kind" IS NULL;
    -- Require every writer to identify its actor; remove the old default too
    -- when this migration is re-applied to an already upgraded database.
    ALTER TABLE "app"."magazine_issue_history"
      ALTER COLUMN "actor_kind" SET NOT NULL,
      ALTER COLUMN "actor_kind" DROP DEFAULT;
    DO $$ BEGIN
      ALTER TABLE "app"."magazine_issue_history"
        ADD CONSTRAINT "magazine_issue_history_actor_kind_check"
        CHECK ("actor_kind" IN ('person', 'automatic'));
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  // Old runs have no trustworthy automatic write timestamp. Leave it null;
  // recovery can still protect published issues, personal schedules and history.
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."magazine_issue_history"
      DROP COLUMN IF EXISTS "actor_kind";
    ALTER TABLE "app"."magazine_auto_draft_run"
      DROP COLUMN IF EXISTS "last_write_at";
  `);
}
