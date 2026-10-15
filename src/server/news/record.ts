import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { newsItems } from "@/server/db/schema";

import {
  ingestNewsItems,
  type IngestNewsOptions,
  type NewsIngestDb,
} from "./ingest";
import { generateNewsSummary } from "./summary";
import { linkIngestedNewsItems } from "./startup-links";
import { parseNewsSector, type NewsSector } from "@/lib/news/sectors";
import { assignNewsItemSectors } from "./sectors";

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
  async linkStartups(rows) {
    await linkIngestedNewsItems(rows);
  },
};

function sectorGroups(
  items: readonly Record<string, unknown>[],
): Array<{ sector: NewsSector; urls: string[] }> {
  const groups = new Map<NewsSector, string[]>();
  for (const item of items) {
    const url = typeof item.url === "string" ? item.url : "";
    if (!url.startsWith("https://")) continue;
    const sector = parseNewsSector(item.sector) ?? "ai";
    const urls = groups.get(sector) ?? [];
    urls.push(url);
    groups.set(sector, urls);
  }
  return [...groups.entries()].map(([sector, urls]) => ({ sector, urls }));
}

/** Store feed rows the first time they are seen, and summarize those rows then. */
export async function recordFeedNews(
  items: readonly Record<string, unknown>[],
  options?: IngestNewsOptions,
): Promise<number> {
  const inserted = await ingestNewsItems(
    store,
    items,
    generateNewsSummary,
    options,
  );
  await assignNewsItemSectors(sectorGroups(items));
  return inserted;
}
