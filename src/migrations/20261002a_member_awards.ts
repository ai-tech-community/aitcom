// Badge catalog and engine (ADR-0039). Additive:
//
// - app.member_award: prizes from a specific challenge or hackathon, with
//   the challenge they came from, instead of free text in
//   member_badge.badge_slug. challenge_id has no foreign key, like every
//   other reference to the Payload challenges table.
// - member_badge.seen_at: when the member saw the earning moment for a
//   badge; null means unseen.
//
// Moving the existing free-text rows is a separate, owner-run backfill
// (scripts/backfill-badges.ts), not part of this migration.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."member_award" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "user_id" varchar(255) NOT NULL
        REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "challenge_id" integer NOT NULL,
      "label" varchar(200) NOT NULL,
      "earned_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "seen_at" timestamp with time zone
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "member_award_user_challenge_label_uidx"
      ON "app"."member_award" USING btree ("user_id", "challenge_id", "label");
    CREATE INDEX IF NOT EXISTS "member_award_challenge_idx"
      ON "app"."member_award" USING btree ("challenge_id");

    ALTER TABLE "app"."member_badge"
      ADD COLUMN IF NOT EXISTS "seen_at" timestamp with time zone;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."member_badge" DROP COLUMN IF EXISTS "seen_at";
    DROP TABLE IF EXISTS "app"."member_award";
  `);
}
