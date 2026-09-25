// Follow-up to 20260925a. That migration is already recorded, so it will
// not run again. Ops found the other four rows on www and no tedai-2026
// row in Neon. This upserts TEDAI only, from the shared seed, with the
// same locales and version rows. It does not touch any other Vienna event.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import {
  BUILDER_PUBLIC_EVENTS,
  BUILDER_PUBLIC_EVENTS_SEEDED_AT,
} from "@/lib/events/builder-public-events";
import { upsertBuilderEvent } from "./20260925a_builder_public_events";

const TEDAI_SLUG = "tedai-2026";
const SEEDED_AT = BUILDER_PUBLIC_EVENTS_SEEDED_AT;

function tedaiEvent() {
  const event = BUILDER_PUBLIC_EVENTS.find((row) => row.slug === TEDAI_SLUG);
  if (!event) {
    throw new Error(`${TEDAI_SLUG} is missing from BUILDER_PUBLIC_EVENTS`);
  }
  return event;
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await upsertBuilderEvent(db, tedaiEvent());
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "_events_v"
    WHERE "created_at" = ${SEEDED_AT}
      AND "parent_id" IN (
        SELECT "id" FROM "events" WHERE "slug" = ${TEDAI_SLUG}
      );
  `);
  await db.execute(sql`
    DELETE FROM "events"
    WHERE "slug" = ${TEDAI_SLUG}
      AND "created_at" = ${SEEDED_AT}
      AND "discovery_source" = 'staff';
  `);
}
