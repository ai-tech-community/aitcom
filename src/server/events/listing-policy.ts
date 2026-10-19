import { sql } from "drizzle-orm";

import { LISTING_POLICY_SQL } from "@/lib/events/listing-policy";
import { db } from "@/server/db";
import { cleanedEventCopy } from "@/server/events/listing-policy-copy";

/** One cron invocation. Later runs continue with whatever notes remain. */
export const EVENT_LISTING_POLICY_BATCH = 40;

export type ListingPolicyCleanup = {
  updated: number;
  remaining: number;
};

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows: unknown }).rows)
  ) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}

async function dirtyEventIds(limit: number): Promise<number[]> {
  const result = await db.execute(sql`
    SELECT id FROM (
      SELECT e.id AS id
      FROM "events" e
      JOIN "events_locales" l ON l."_parent_id" = e.id
      WHERE COALESCE(l."summary", '') ~* ${LISTING_POLICY_SQL}
         OR COALESCE(l."description"::text, '') ~* ${LISTING_POLICY_SQL}
      UNION
      SELECT v."parent_id" AS id
      FROM "_events_v" v
      JOIN "_events_v_locales" vl ON vl."_parent_id" = v.id
      WHERE v."parent_id" IS NOT NULL
        AND (
          COALESCE(vl."version_summary", '') ~* ${LISTING_POLICY_SQL}
          OR COALESCE(vl."version_description"::text, '') ~* ${LISTING_POLICY_SQL}
        )
    ) dirty
    ORDER BY id
    LIMIT ${limit}
  `);
  return rowsOf(result)
    .map((row) => Number(row.id))
    .filter((id) => Number.isInteger(id));
}

async function countDirtyEvents(): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS value FROM (
      SELECT e.id AS id
      FROM "events" e
      JOIN "events_locales" l ON l."_parent_id" = e.id
      WHERE COALESCE(l."summary", '') ~* ${LISTING_POLICY_SQL}
         OR COALESCE(l."description"::text, '') ~* ${LISTING_POLICY_SQL}
      UNION
      SELECT v."parent_id" AS id
      FROM "_events_v" v
      JOIN "_events_v_locales" vl ON vl."_parent_id" = v.id
      WHERE v."parent_id" IS NOT NULL
        AND (
          COALESCE(vl."version_summary", '') ~* ${LISTING_POLICY_SQL}
          OR COALESCE(vl."version_description"::text, '') ~* ${LISTING_POLICY_SQL}
        )
    ) dirty
  `);
  const value = Number(rowsOf(result)[0]?.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

async function cleanLocales(eventId: number): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT "id", "summary", "description"
    FROM "events_locales"
    WHERE "_parent_id" = ${eventId}
    ORDER BY "id"
  `);
  let changed = false;
  for (const row of rowsOf(result)) {
    const id = Number(row.id);
    const next = cleanedEventCopy({
      summary: typeof row.summary === "string" ? row.summary : null,
      description: row.description,
    });
    if (!next.changed) continue;
    await db.execute(sql`
      UPDATE "events_locales"
      SET "summary" = ${next.summary},
          "description" = ${JSON.stringify(next.description)}::jsonb
      WHERE "id" = ${id}
    `);
    changed = true;
  }
  return changed;
}

async function cleanVersions(eventId: number): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT vl."id" AS id,
           vl."version_summary" AS summary,
           vl."version_description" AS description
    FROM "_events_v" v
    JOIN "_events_v_locales" vl ON vl."_parent_id" = v.id
    WHERE v."parent_id" = ${eventId}
    ORDER BY vl."id"
  `);
  let changed = false;
  for (const row of rowsOf(result)) {
    const id = Number(row.id);
    const next = cleanedEventCopy({
      summary: typeof row.summary === "string" ? row.summary : null,
      description: row.description,
    });
    if (!next.changed) continue;
    await db.execute(sql`
      UPDATE "_events_v_locales"
      SET "version_summary" = ${next.summary},
          "version_description" = ${JSON.stringify(next.description)}::jsonb
      WHERE "id" = ${id}
    `);
    changed = true;
  }
  return changed;
}

/**
 * Remove listing-policy notes from stored event copy, one batch of events
 * at a time. A row that is already clean is not rewritten. Running it again
 * updates nothing once every note is gone. Live rows and version rows are
 * both cleaned so publishing an older version cannot put the note back.
 */
export async function stripStoredEventListingPolicy(
  batch: number = EVENT_LISTING_POLICY_BATCH,
): Promise<ListingPolicyCleanup> {
  const size = Number.isFinite(batch) && batch > 0 ? Math.floor(batch) : 1;
  const ids = await dirtyEventIds(size);
  let updated = 0;
  for (const id of ids) {
    const locales = await cleanLocales(id);
    const versions = await cleanVersions(id);
    if (locales || versions) updated += 1;
  }
  return { updated, remaining: await countDirtyEvents() };
}
