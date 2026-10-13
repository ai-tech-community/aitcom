import { parseFeed, NotAFeedError } from "@/server/collectors/helpers/feed";

import { NEWS_FEED_ITEM_LIMIT, NEWS_FEEDS } from "./feeds";

const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5";

export type FeedIngestResult = {
  url: string;
  name: string;
  ok: boolean;
  inserted: number;
  error?: string;
};

export type IngestFeedsDeps = {
  feeds: readonly { name: string; url: string }[];
  fetchXml: (url: string) => Promise<string>;
  record: (items: readonly Record<string, unknown>[]) => Promise<number>;
  limit?: number;
};

/** Fetch each configured feed and store new article URLs. One feed failing does not stop the others. */
export async function ingestFeeds(
  deps: IngestFeedsDeps,
): Promise<{ inserted: number; feeds: FeedIngestResult[] }> {
  const limit = deps.limit ?? NEWS_FEED_ITEM_LIMIT;
  const feeds: FeedIngestResult[] = [];
  let inserted = 0;
  for (const feed of deps.feeds) {
    try {
      const xml = await deps.fetchXml(feed.url);
      const entries = parseFeed(xml, feed.url)
        .filter((entry) => entry.url && entry.title)
        .slice(0, limit);
      const count = await deps.record(entries);
      inserted += count;
      feeds.push({ url: feed.url, name: feed.name, ok: true, inserted: count });
    } catch (err) {
      const error =
        err instanceof NotAFeedError
          ? "Not an RSS or Atom feed."
          : err instanceof Error
            ? err.message
            : "The feed could not be read.";
      feeds.push({
        url: feed.url,
        name: feed.name,
        ok: false,
        inserted: 0,
        error,
      });
    }
  }
  return { inserted, feeds };
}

export async function fetchFeedXml(url: string): Promise<string> {
  const { safeFetch } = await import("@/server/net/safe-fetch");
  const { response } = await safeFetch(url, {
    userAgent: "AIT-news-feeds",
    timeoutMs: 20_000,
    accept: FEED_ACCEPT,
    allowErrorStatus: true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`The feed answered with status ${response.status}.`);
  }
  return response.text();
}

/** The production ingest: the four configured feeds, through the existing store. */
export async function ingestConfiguredNewsFeeds() {
  const { recordFeedNews } = await import("./record");
  return ingestFeeds({
    feeds: NEWS_FEEDS,
    fetchXml: fetchFeedXml,
    record: (items) => recordFeedNews(items),
  });
}
