import { db } from "@/server/db";
import { newsFeeds } from "@/server/db/schema";

import { NEWS_FEEDS } from "./feeds";
import {
  mergeNewsFeeds,
  type NewsFeedAddress,
  type StoredNewsFeed,
} from "./merge-feeds";

export type { NewsFeedAddress, StoredNewsFeed };
export { mergeNewsFeeds };

/** Feeds for one ingest. A missing table falls back to the built-in list. */
export async function loadNewsFeeds(): Promise<NewsFeedAddress[]> {
  try {
    const stored = await db
      .select({
        name: newsFeeds.name,
        url: newsFeeds.url,
        enabled: newsFeeds.enabled,
      })
      .from(newsFeeds);
    const missing = NEWS_FEEDS.filter(
      (feed) => !stored.some((row) => row.url === feed.url),
    );
    if (missing.length > 0) {
      await db
        .insert(newsFeeds)
        .values(missing.map((feed) => ({ name: feed.name, url: feed.url })))
        .onConflictDoNothing({ target: newsFeeds.url });
    }
    return mergeNewsFeeds(NEWS_FEEDS, stored);
  } catch (err) {
    console.error("news: could not read the feed table", err);
    return NEWS_FEEDS.map((feed) => ({ name: feed.name, url: feed.url }));
  }
}

export async function insertNewsFeed(
  feed: NewsFeedAddress,
): Promise<"inserted" | "duplicate"> {
  const inserted = await db
    .insert(newsFeeds)
    .values(feed)
    .onConflictDoNothing({ target: newsFeeds.url })
    .returning({ id: newsFeeds.id });
  return inserted.length > 0 ? "inserted" : "duplicate";
}
