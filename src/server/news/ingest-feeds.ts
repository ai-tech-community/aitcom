import { parseFeed, NotAFeedError } from "@/server/collectors/helpers/feed";

import { NEWS_FEED_ITEM_LIMIT } from "./feeds";
import type { IngestNewsOptions } from "./ingest";

const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5";

/** Parallel feed fetches. Each one still has its own timeout. */
const FEED_FETCH_CONCURRENCY = 6;

/** Summaries after the URLs are stored. Kept under the 300s cron limit. */
const SUMMARY_CONCURRENCY = 4;
const INGEST_BUDGET_MS = 240_000;

export type FeedIngestResult = {
  url: string;
  name: string;
  ok: boolean;
  /** URLs from this feed included in the deduped batch. */
  items: number;
  error?: string;
};

export type IngestFeedsDeps = {
  feeds: readonly { name: string; url: string; sector?: string }[];
  fetchXml: (url: string) => Promise<string>;
  record: (
    items: readonly Record<string, unknown>[],
    options?: IngestNewsOptions,
  ) => Promise<number>;
  limit?: number;
  concurrency?: number;
  budgetMs?: number;
  now?: () => number;
};

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await fn(item);
    }
  }
  const workers = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/** Fetch each configured feed and store new article URLs. One feed failing does not stop the others. */
export async function ingestFeeds(
  deps: IngestFeedsDeps,
): Promise<{ inserted: number; feeds: FeedIngestResult[] }> {
  const limit = deps.limit ?? NEWS_FEED_ITEM_LIMIT;
  const started = deps.now?.() ?? Date.now();
  const fetched = await mapPool(
    deps.feeds,
    deps.concurrency ?? FEED_FETCH_CONCURRENCY,
    async (feed) => {
      try {
        const xml = await deps.fetchXml(feed.url);
        const entries = parseFeed(xml, feed.url)
          .filter((entry) => entry.url && entry.title)
          .slice(0, limit);
        return { feed, ok: true as const, entries };
      } catch (err) {
        const error =
          err instanceof NotAFeedError
            ? "Not an RSS or Atom feed."
            : err instanceof Error
              ? err.message
              : "The feed could not be read.";
        return { feed, ok: false as const, error };
      }
    },
  );

  const seen = new Set<string>();
  const items: Record<string, unknown>[] = [];
  const feeds: FeedIngestResult[] = [];
  for (const row of fetched) {
    if (!row.ok) {
      feeds.push({
        url: row.feed.url,
        name: row.feed.name,
        ok: false,
        items: 0,
        error: row.error,
      });
      continue;
    }
    let count = 0;
    for (const entry of row.entries) {
      if (!entry.url || seen.has(entry.url)) continue;
      seen.add(entry.url);
      items.push({ ...entry, sector: row.feed.sector ?? "ai" });
      count += 1;
    }
    feeds.push({
      url: row.feed.url,
      name: row.feed.name,
      ok: true,
      items: count,
    });
  }

  const inserted =
    items.length > 0
      ? await deps.record(items, {
          summaryConcurrency: SUMMARY_CONCURRENCY,
          summaryDeadline: started + (deps.budgetMs ?? INGEST_BUDGET_MS),
        })
      : 0;
  return { inserted, feeds };
}

export async function fetchFeedXml(url: string): Promise<string> {
  const { safeFetch } = await import("@/server/net/safe-fetch");
  const { response } = await safeFetch(url, {
    userAgent: "AIT-news-feeds",
    timeoutMs: 12_000,
    accept: FEED_ACCEPT,
    allowErrorStatus: true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`The feed answered with status ${response.status}.`);
  }
  return response.text();
}

/** The production ingest: built-in feeds plus any staff added, through the existing store. */
export async function ingestConfiguredNewsFeeds() {
  const { loadNewsFeeds } = await import("./catalog");
  const { recordFeedNews } = await import("./record");
  return ingestFeeds({
    feeds: await loadNewsFeeds(),
    fetchXml: fetchFeedXml,
    record: (items, options) => recordFeedNews(items, options),
  });
}
