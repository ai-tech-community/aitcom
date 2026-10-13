import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { newsItems } from "@/server/db/schema";

import { ingestNewsItems, type NewsIngestDb } from "./ingest";
import { generateNewsSummary } from "./summary";

const store: NewsIngestDb = {
  async insertNew(rows) {
    if (rows.length === 0) return [];
    return db
      .insert(newsItems)
      .values(rows)
      .onConflictDoNothing({ target: newsItems.url })
      .returning({
        id: newsItems.id,
        url: newsItems.url,
        title: newsItems.title,
        summary: newsItems.summary,
      });
  },
  async saveSummary(id, aiSummary) {
    await db
      .update(newsItems)
      .set({ aiSummary })
      .where(and(eq(newsItems.id, id), isNull(newsItems.aiSummary)));
  },
  async unsummarized(urls) {
    if (urls.length === 0) return [];
    return db
      .select({
        id: newsItems.id,
        url: newsItems.url,
        title: newsItems.title,
        summary: newsItems.summary,
      })
      .from(newsItems)
      .where(
        and(inArray(newsItems.url, [...urls]), isNull(newsItems.aiSummary)),
      );
  },
};

/** Store feed rows the first time they are seen, and summarize those rows then. */
export async function recordFeedNews(
  items: readonly Record<string, unknown>[],
): Promise<number> {
  return ingestNewsItems(store, items, generateNewsSummary);
}
