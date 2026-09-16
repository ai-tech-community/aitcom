// Adds the weekday +5 curated public events. World Summit stays from
// 20260915a. Idempotent: ON CONFLICT (url) DO NOTHING.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import {
  CURATED_PUBLIC_EVENT_SEEDS,
  CURATED_PUBLIC_EVENT_WEEKDAY_IDS,
} from "@/lib/events/public-events-seeds";

const WEEKDAY_IDS = new Set<string>(CURATED_PUBLIC_EVENT_WEEKDAY_IDS);

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const seed of CURATED_PUBLIC_EVENT_SEEDS) {
    if (!WEEKDAY_IDS.has(seed.id)) continue;
    await db.execute(sql`
      INSERT INTO "app"."curated_public_event" (
        "id", "title", "date", "online", "city", "url",
        "why_en", "why_nl", "created_at"
      ) VALUES (
        ${seed.id},
        ${seed.title},
        ${seed.date},
        ${seed.online},
        ${seed.city},
        ${seed.url},
        ${seed.why.en},
        ${seed.why.nl},
        '2026-09-16T12:00:00Z'
      )
      ON CONFLICT ("url") DO NOTHING;
    `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const id of CURATED_PUBLIC_EVENT_WEEKDAY_IDS) {
    await db.execute(sql`
      DELETE FROM "app"."curated_public_event" WHERE "id" = ${id};
    `);
  }
}
