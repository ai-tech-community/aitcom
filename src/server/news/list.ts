import { desc, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { newsItems } from "@/server/db/schema";

export type NewsListItem = {
  id: string;
  url: string;
  title: string;
  author: string | null;
  publishedAt: Date | null;
  summary: string;
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
    })
    .from(newsItems)
    .orderBy(
      sql`${newsItems.publishedAt} desc nulls last`,
      desc(newsItems.createdAt),
    )
    .limit(limit);
}
