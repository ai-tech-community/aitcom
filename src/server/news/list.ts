import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { newsItems } from "@/server/db/schema";

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
};

export async function listNewsItems(limit = 50): Promise<NewsListItem[]> {
  return db
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
  return row ?? null;
}
