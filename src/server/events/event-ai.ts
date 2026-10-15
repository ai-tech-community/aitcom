import { sql } from "drizzle-orm";

import { lexicalToPlainText } from "@/server/challenge-engine/lexical";
import {
  classifyEventAi,
  groupEventAiUpdates,
  type ClassifiableEvent,
  type EventAiFilter,
} from "@/lib/events/event-ai";
import { db } from "@/server/db";

/** One cron invocation. A full table walks across later runs. */
export const EVENT_AI_BACKFILL_BATCH = 1000;

export type EventAiBackfill = {
  updated: number;
  remaining: number;
};

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  const record = error as { message?: unknown; cause?: unknown };
  const message = typeof record.message === "string" ? record.message : "";
  return `${message}\n${errorText(record.cause)}`;
}

/** Preview builds skip migrations, so `is_ai` may not exist yet. */
export function isMissingEventAiColumn(error: unknown): boolean {
  const text = errorText(error);
  return (
    text.includes("is_ai") &&
    (text.includes("does not exist") || text.includes("42703"))
  );
}

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

function descriptionList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function plainDescription(value: unknown): string {
  return descriptionList(value)
    .map((entry) => lexicalToPlainText(entry))
    .filter((entry) => entry.length > 0)
    .join("\n\n");
}

function sqlIdList(ids: readonly number[]) {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
}

/**
 * Stores `is_ai` from text the caller already has. False and null both
 * keep the event. A missing column (preview before the migration) is
 * ignored so the save still succeeds.
 */
export async function rememberEventAi(
  id: number,
  title: string,
  description?: string | null,
  summary?: string | null,
): Promise<void> {
  const isAi = classifyEventAi(title, description, summary);
  const flag = isAi === null ? sql`NULL` : sql`${isAi}`;
  try {
    await db.execute(sql`
      UPDATE "events"
      SET "is_ai" = ${flag}
      WHERE "id" = ${id}
    `);
  } catch (error) {
    if (isMissingEventAiColumn(error)) return;
    console.error("[event-ai] could not store is_ai", error);
  }
}

/**
 * Reclassifies when a save changes title, summary, or description.
 * Other edits leave the stored flag alone.
 */
export async function rememberEventAiFromEdit(
  id: number,
  input: {
    title?: string;
    description?: string | null;
    summary?: string | null;
  },
  existing?: {
    title?: string | null;
    description?: unknown;
    summary?: string | null;
  },
): Promise<void> {
  const touchesText =
    input.title !== undefined ||
    input.description !== undefined ||
    input.summary !== undefined;
  if (existing && !touchesText) return;
  const title = input.title ?? existing?.title ?? "";
  const description =
    input.description !== undefined
      ? (input.description ?? "")
      : lexicalToPlainText(existing?.description);
  const summary =
    input.summary !== undefined
      ? (input.summary ?? "")
      : (existing?.summary ?? "");
  await rememberEventAi(id, title, description, summary);
}

/**
 * Classifies events whose `is_ai` is still null, from stored title,
 * summary, and description. A row that is already true or false is
 * skipped. An ambiguous reading stays null, so it is not listed as
 * not-AI and a later run can still read it. A second run writes nothing
 * when every remaining null row is ambiguous. A non-AI reading is stored;
 * the event stays in the table.
 */
export async function backfillEventAi(
  batch: number = EVENT_AI_BACKFILL_BATCH,
): Promise<EventAiBackfill> {
  const size = Number.isFinite(batch) && batch > 0 ? Math.floor(batch) : 1;
  const pending = await db.execute(sql`
    SELECT e.id,
      COALESCE(string_agg(l.title, E'\n' ORDER BY l._locale), '') AS title,
      COALESCE(string_agg(l.summary, E'\n' ORDER BY l._locale), '') AS summary,
      COALESCE(
        jsonb_agg(l.description) FILTER (WHERE l.description IS NOT NULL),
        '[]'::jsonb
      ) AS descriptions
    FROM "events" e
    LEFT JOIN "events_locales" l ON l."_parent_id" = e.id
    WHERE e."is_ai" IS NULL
    GROUP BY e.id
    ORDER BY e.id
    LIMIT ${size}
  `);

  const rows: ClassifiableEvent[] = rowsOf(pending).map((row) => ({
    id: Number(row.id),
    title: typeof row.title === "string" ? row.title : "",
    summary: typeof row.summary === "string" ? row.summary : "",
    description: plainDescription(row.descriptions),
  }));

  if (rows.length === 0) {
    return { updated: 0, remaining: 0 };
  }

  const groups = groupEventAiUpdates(rows);
  let updated = 0;
  if (groups.ai.length > 0) {
    const written = await db.execute(sql`
      UPDATE "events"
      SET "is_ai" = true
      WHERE "id" IN (${sqlIdList(groups.ai)})
        AND "is_ai" IS NULL
      RETURNING "id"
    `);
    updated += rowsOf(written).length;
  }
  if (groups.notAi.length > 0) {
    const written = await db.execute(sql`
      UPDATE "events"
      SET "is_ai" = false
      WHERE "id" IN (${sqlIdList(groups.notAi)})
        AND "is_ai" IS NULL
      RETURNING "id"
    `);
    updated += rowsOf(written).length;
  }

  const left = await db.execute(sql`
    SELECT count(*)::int AS value
    FROM "events"
    WHERE "is_ai" IS NULL
  `);
  const remaining = Number(rowsOf(left)[0]?.value ?? 0);

  return {
    updated,
    remaining: Number.isFinite(remaining) ? remaining : 0,
  };
}

/** Ids whose stored flag matches the filter. Null rows match neither side. */
export async function loadEventIdsByAi(
  filter: EventAiFilter,
): Promise<number[]> {
  try {
    const flag = filter === "yes";
    const result = await db.execute(sql`
      SELECT "id" FROM "events" WHERE "is_ai" = ${flag}
    `);
    return rowsOf(result)
      .map((row) => Number(row.id))
      .filter((id) => Number.isInteger(id));
  } catch (error) {
    if (isMissingEventAiColumn(error)) return [];
    throw error;
  }
}

/** Stored flags for the rows on this page. Missing column yields no badges. */
export async function loadEventAiFlags(
  ids: readonly number[],
): Promise<Map<number, boolean>> {
  const flags = new Map<number, boolean>();
  if (ids.length === 0) return flags;
  try {
    const result = await db.execute(sql`
      SELECT "id", "is_ai"
      FROM "events"
      WHERE "id" IN (${sqlIdList(ids)})
        AND "is_ai" IS NOT NULL
    `);
    for (const row of rowsOf(result)) {
      const id = Number(row.id);
      if (!Number.isInteger(id)) continue;
      if (row.is_ai === true || row.is_ai === false) flags.set(id, row.is_ai);
    }
    return flags;
  } catch (error) {
    if (isMissingEventAiColumn(error)) return flags;
    throw error;
  }
}
