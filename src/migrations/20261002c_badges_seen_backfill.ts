// The earning moment (ADR-0039, slice 5). Before this slice nothing set
// seen_at, so every existing member_badge and member_award row is null.
// This marks every row that is still unseen as seen, dated when it was
// earned, so nobody is celebrated for what they already held.
//
// What decides a celebration is not this migration alone: the celebration
// query (src/server/badges/earning-moment.ts) also requires the live path's
// marker, a `badge_earned` notification for that member and badge slug or
// an `award_won` notification for that award row. So a row written with a
// null seen_at after this ran by code that does not celebrate it (an older
// deployment still serving during the build, a failed build, a preview or
// a local run sharing the database, an older backfill) is never shown. A
// badge an older deployment celebrated (it did write the notification) may
// be shown once, which is right for a badge just earned.
//
// Data only and idempotent: a re-run finds no null rows from before it.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "app"."member_badge"
      SET "seen_at" = "earned_at"
      WHERE "seen_at" IS NULL;
    UPDATE "app"."member_award"
      SET "seen_at" = "earned_at"
      WHERE "seen_at" IS NULL;
  `);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Nothing to undo: which rows were unseen before is not recorded, and a
  // row marked seen is never wrong to keep (it only skips a celebration).
}
