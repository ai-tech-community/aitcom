import { and, asc, count, gt, inArray, isNull } from "drizzle-orm";

import {
  groupNewsAiUpdates,
  type ClassifiableNewsItem,
} from "@/lib/news/news-ai";
import { db } from "@/server/db";
import { newsItems } from "@/server/db/schema";

/** One query inside a cron invocation. A full table walks across queries. */
export const NEWS_ITEM_AI_BACKFILL_BATCH = 1000;

/** Caps one cron so a large null set cannot hold the request open. */
const NEWS_ITEM_AI_BACKFILL_MAX_BATCHES = 20;

export type NewsItemAiBackfill = {
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
export function isMissingNewsAiColumn(error: unknown): boolean {
  const text = errorText(error);
  return (
    text.includes("is_ai") &&
    (text.includes("does not exist") || text.includes("42703"))
  );
}

/**
 * Stored flags for these rows. Missing column yields an empty map so the
 * news page still renders. Null stays out of the map: the story is untagged.
 */
export async function loadNewsItemAiFlags(
  ids: readonly string[],
): Promise<Map<string, boolean>> {
  const flags = new Map<string, boolean>();
  if (ids.length === 0) return flags;
  try {
    const rows = await db
      .select({ id: newsItems.id, isAi: newsItems.isAi })
      .from(newsItems)
      .where(inArray(newsItems.id, [...ids]));
    for (const row of rows) {
      if (row.isAi === true || row.isAi === false) flags.set(row.id, row.isAi);
    }
    return flags;
  } catch (error) {
    if (isMissingNewsAiColumn(error)) return flags;
    throw error;
  }
}

/**
 * Classifies stories whose `is_ai` is still null, from title and source
 * excerpt. A row that is already true or false is skipped. An ambiguous
 * reading stays null, so it is not listed as not-AI. A second run writes
 * nothing once every remaining null row is ambiguous. A non-AI reading is
 * stored; the story stays in the table.
 */
export async function backfillNewsItemAi(
  batch: number = NEWS_ITEM_AI_BACKFILL_BATCH,
): Promise<NewsItemAiBackfill> {
  const size = Number.isFinite(batch) && batch > 0 ? Math.floor(batch) : 1;
  let cursor: string | null = null;
  let updated = 0;

  for (let pass = 0; pass < NEWS_ITEM_AI_BACKFILL_MAX_BATCHES; pass += 1) {
    const pending = isNull(newsItems.isAi);
    const rows = await db
      .select({
        id: newsItems.id,
        title: newsItems.title,
        summary: newsItems.summary,
      })
      .from(newsItems)
      .where(cursor ? and(pending, gt(newsItems.id, cursor)) : pending)
      .orderBy(asc(newsItems.id))
      .limit(size);

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]?.id ?? cursor;
    updated += await writeNewsAiGroups(rows);
    if (rows.length < size) break;
  }

  const [left] = await db
    .select({ value: count() })
    .from(newsItems)
    .where(isNull(newsItems.isAi));

  return {
    updated,
    remaining: Number(left?.value ?? 0),
  };
}

async function writeNewsAiGroups(
  rows: readonly ClassifiableNewsItem[],
): Promise<number> {
  const groups = groupNewsAiUpdates(rows);
  let updated = 0;
  if (groups.ai.length > 0) {
    const written = await db
      .update(newsItems)
      .set({ isAi: true })
      .where(and(inArray(newsItems.id, groups.ai), isNull(newsItems.isAi)))
      .returning({ id: newsItems.id });
    updated += written.length;
  }
  if (groups.notAi.length > 0) {
    const written = await db
      .update(newsItems)
      .set({ isAi: false })
      .where(and(inArray(newsItems.id, groups.notAi), isNull(newsItems.isAi)))
      .returning({ id: newsItems.id });
    updated += written.length;
  }
  return updated;
}
