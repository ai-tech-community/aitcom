// Adds the conference event type and corrects rows the staff seed and the
// scout import stored as meetup. Idempotent: ADD VALUE IF NOT EXISTS, and
// each update matches only a row that still has the old type.
//
// ADD VALUE is committed in its own statement before any update uses
// `conference`. Postgres rejects a new enum value in the same transaction.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import { EVENT_TYPE_CORRECTIONS } from "@/lib/events/event-type-corrections";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_events_type" ADD VALUE IF NOT EXISTS 'conference';
  `);
  await db.execute(sql`
    ALTER TYPE "public"."enum__events_v_version_type" ADD VALUE IF NOT EXISTS 'conference';
  `);

  for (const row of EVENT_TYPE_CORRECTIONS) {
    await db.execute(sql`
      UPDATE "events"
      SET "type" = ${row.type}::"public"."enum_events_type"
      WHERE "slug" = ${row.slug}
        AND "type" IS DISTINCT FROM ${row.type}::"public"."enum_events_type";
    `);
    await db.execute(sql`
      UPDATE "_events_v"
      SET "version_type" = ${row.type}::"public"."enum__events_v_version_type"
      WHERE "parent_id" IN (
        SELECT "id" FROM "events" WHERE "slug" = ${row.slug}
      )
        AND "version_type" IS DISTINCT FROM ${row.type}::"public"."enum__events_v_version_type";
    `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const row of EVENT_TYPE_CORRECTIONS) {
    await db.execute(sql`
      UPDATE "events"
      SET "type" = 'meetup'::"public"."enum_events_type"
      WHERE "slug" = ${row.slug}
        AND "type" = ${row.type}::"public"."enum_events_type";
    `);
    await db.execute(sql`
      UPDATE "_events_v"
      SET "version_type" = 'meetup'::"public"."enum__events_v_version_type"
      WHERE "parent_id" IN (
        SELECT "id" FROM "events" WHERE "slug" = ${row.slug}
      )
        AND "version_type" = ${row.type}::"public"."enum__events_v_version_type";
    `);
  }
}
