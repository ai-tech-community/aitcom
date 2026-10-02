// The earning moment (ADR-0039, slice 5): a badge or award row whose
// seen_at is null is shown once in the celebration dialog. Before this
// slice nothing ever set seen_at, so every existing row is null; without
// this migration every member would be "celebrated" for everything they
// already hold.
//
// This marks every row that is still unseen as seen, dated when it was
// earned. Marking all of them is correct because of how deploys run:
// scripts/db-apply-on-deploy.ts applies pending migrations in the Vercel
// production build, before `next build`, so the new deployment (the first
// code that reads seen_at, and the first that leaves it null on purpose
// for a celebrated tier) only serves traffic after this has run. No row
// that the new code means to celebrate can exist yet.
//
// The one gap is the build itself: while it runs, the previous deployment
// still serves traffic and inserts rows with seen_at null. Those few rows
// (earned in the minutes between this migration and the promotion) are
// celebrated once by the new code, which is the right outcome for a badge
// earned that moment.
//
// Data only and idempotent: a re-run finds no null rows.
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
