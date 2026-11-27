import { eq } from "drizzle-orm";
import { newsSectorOrDefault } from "@/lib/news/sectors";
import { db } from "@/server/db";
import { newsFeeds } from "@/server/db/schema";

import { NEWS_FEEDS } from "./feeds";
import {
  mergeNewsFeeds,
  type NewsFeedAddress,
  type StoredNewsFeed,
} from "./merge-feeds";
import { assignNewsFeedSector } from "./sectors";

export type { NewsFeedAddress, StoredNewsFeed };
export { mergeNewsFeeds };

/** Seed baseline addresses, then read the same catalog admins choose from. */
export async function loadNewsFeeds() {
  await db
    .insert(newsFeeds)
    .values(NEWS_FEEDS.map(({ name, url }) => ({ name, url })))
    .onConflictDoNothing({ target: newsFeeds.url });
  const rows = await db
    .select()
    .from(newsFeeds)
    .where(eq(newsFeeds.enabled, true))
    .orderBy(newsFeeds.createdAt, newsFeeds.url);
  return rows.map(({ name, url, sector }) => ({
    name,
    url,
    sector: newsSectorOrDefault(sector),
  }));
}

export async function insertNewsFeed(
  feed: NewsFeedAddress & { sector?: string | null },
): Promise<"inserted" | "duplicate"> {
  const inserted = await db
    .insert(newsFeeds)
    .values({ name: feed.name, url: feed.url })
    .onConflictDoNothing({ target: newsFeeds.url })
    .returning({ id: newsFeeds.id });
  await assignNewsFeedSector(feed.url, newsSectorOrDefault(feed.sector));
  return inserted.length > 0 ? "inserted" : "duplicate";
}
