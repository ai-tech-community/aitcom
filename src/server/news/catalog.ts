import { newsSectorOrDefault, type NewsSector } from "@/lib/news/sectors";
import { db } from "@/server/db";
import { newsFeeds } from "@/server/db/schema";

import { NEWS_FEEDS } from "./feeds";
import {
  mergeNewsFeeds,
  type NewsFeedAddress,
  type StoredNewsFeed,
} from "./merge-feeds";
import { assignNewsFeedSector, isMissingNewsSectorSchema } from "./sectors";

export type { NewsFeedAddress, StoredNewsFeed };
export { mergeNewsFeeds };

type StoredFeed = StoredNewsFeed & { sector: string | null };

async function selectStoredFeeds(): Promise<StoredFeed[]> {
  try {
    return await db
      .select({
        name: newsFeeds.name,
        url: newsFeeds.url,
        enabled: newsFeeds.enabled,
        sector: newsFeeds.sector,
      })
      .from(newsFeeds);
  } catch (error) {
    if (!isMissingNewsSectorSchema(error)) throw error;
    const rows = await db
      .select({
        name: newsFeeds.name,
        url: newsFeeds.url,
        enabled: newsFeeds.enabled,
      })
      .from(newsFeeds);
    return rows.map((row) => ({ ...row, sector: null }));
  }
}

/** Feeds for one ingest. A missing table falls back to the built-in list. */
export async function loadNewsFeeds(): Promise<
  Array<NewsFeedAddress & { sector: NewsSector }>
> {
  try {
    const stored = await selectStoredFeeds();
    const missing = NEWS_FEEDS.filter(
      (feed) => !stored.some((row) => row.url === feed.url),
    );
    if (missing.length > 0) {
      await db
        .insert(newsFeeds)
        .values(missing.map((feed) => ({ name: feed.name, url: feed.url })))
        .onConflictDoNothing({ target: newsFeeds.url });
    }
    const sectorByUrl = new Map(stored.map((row) => [row.url, row.sector]));
    return mergeNewsFeeds(NEWS_FEEDS, stored).map((feed) => ({
      ...feed,
      sector: newsSectorOrDefault(sectorByUrl.get(feed.url) ?? "ai"),
    }));
  } catch (err) {
    console.error("news: could not read the feed table", err);
    return NEWS_FEEDS.map((feed) => ({
      name: feed.name,
      url: feed.url,
      sector: "ai" as const,
    }));
  }
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
