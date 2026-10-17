import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { newsItems } from "@/server/db/schema";

import { loadNewsItemAiFlags } from "./item-ai";

export type NewsListItem = {
  id: string;
  url: string;
  title: string;
  author: string | null;
  publishedAt: Date | null;
  /** Feed description or excerpt. Not a generated line. */
  summary: string;
  /** TL;DR written at ingest from the feed text. Null until that write lands. */
  aiSummary: string | null;
  /**
   * True when the title and excerpt are about AI. False when they are not.
   * Null when the reading is unclear or the column is not there yet.
   */
  isAi?: boolean | null;
};

async function withAiFlags(rows: NewsListItem[]): Promise<NewsListItem[]> {
  const flags = await loadNewsItemAiFlags(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    isAi: flags.has(row.id) ? flags.get(row.id)! : null,
  }));
}

export async function listNewsItems(limit = 50): Promise<NewsListItem[]> {
  const rows = await db
    .select({
      id: newsItems.id,
      url: newsItems.url,
      title: newsItems.title,
      author: newsItems.author,
      publishedAt: newsItems.publishedAt,
      summary: newsItems.summary,
      aiSummary: newsItems.aiSummary,
    })
    .from(newsItems)
    .orderBy(
      sql`${newsItems.publishedAt} desc nulls last`,
      desc(newsItems.createdAt),
    )
    .limit(limit);
  return withAiFlags(rows);
}

export async function findNewsItem(id: string): Promise<NewsListItem | null> {
  const [row] = await db
    .select({
      id: newsItems.id,
      url: newsItems.url,
      title: newsItems.title,
      author: newsItems.author,
      publishedAt: newsItems.publishedAt,
      summary: newsItems.summary,
      aiSummary: newsItems.aiSummary,
    })
    .from(newsItems)
    .where(eq(newsItems.id, id))
    .limit(1);
  if (!row) return null;
  const [tagged] = await withAiFlags([row]);
  return tagged ?? null;
}
