// Event organizer (ADR-0038): the one member who runs a native event and
// alone sees its attendee details. Adds the column, then backfills native
// events in order of evidence:
//   1. submitted_by (a member proposed it and runs it)
//   2. the actor of the event's `event.create` activity event
//   3. a hackathon's bound challenge creator
// External events (source_url set) stay null. Native events with no evidence
// stay null; the community owner assigns them from the events page.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "organizer_id" varchar;

    ALTER TABLE "_events_v"
      ADD COLUMN IF NOT EXISTS "version_organizer_id" varchar;

    CREATE INDEX IF NOT EXISTS "events_organizer_id_idx" ON "events" USING btree ("organizer_id");
    CREATE INDEX IF NOT EXISTS "_events_v_version_organizer_id_idx" ON "_events_v" USING btree ("version_organizer_id");
  `);

  const bySubmitter = await db.execute(sql`
    UPDATE "events" SET "organizer_id" = "submitted_by"
    WHERE "organizer_id" IS NULL
      AND ("source_url" IS NULL OR "source_url" = '')
      AND "submitted_by" IS NOT NULL AND "submitted_by" <> ''
  `);

  const byActivity = await db.execute(sql`
    UPDATE "events" e SET "organizer_id" = a."actor_id"
    FROM (
      SELECT DISTINCT ON ("target_id") "target_id", "actor_id"
      FROM "app"."activity_event"
      WHERE "action" = 'event.create' AND "target_type" = 'event'
      ORDER BY "target_id", "created_at" ASC
    ) a
    WHERE e."organizer_id" IS NULL
      AND (e."source_url" IS NULL OR e."source_url" = '')
      AND a."target_id" = e."id"::text
  `);

  const byChallenge = await db.execute(sql`
    UPDATE "events" e SET "organizer_id" = c."creator_id"
    FROM "challenges" c
    WHERE e."organizer_id" IS NULL
      AND (e."source_url" IS NULL OR e."source_url" = '')
      AND e."challenge_id" IS NOT NULL
      AND c."id"::text = e."challenge_id"
      AND c."creator_id" IS NOT NULL AND c."creator_id" <> ''
  `);

  const unassigned = await db.execute(sql`
    SELECT count(*)::int AS n FROM "events"
    WHERE "organizer_id" IS NULL
      AND ("source_url" IS NULL OR "source_url" = '')
  `);

  payload.logger.info(
    `event organizer backfill: submitter=${bySubmitter.rowCount ?? 0} activity=${byActivity.rowCount ?? 0} challenge=${byChallenge.rowCount ?? 0} still-unassigned-native=${(unassigned.rows[0] as { n: number } | undefined)?.n ?? 0}`,
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "_events_v_version_organizer_id_idx";
    DROP INDEX IF EXISTS "events_organizer_id_idx";
    ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_organizer_id";
    ALTER TABLE "events" DROP COLUMN IF EXISTS "organizer_id";
  `);
}
