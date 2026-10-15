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
  /** Entries with a title and URL, before this run's dedupe. */
  fetched: number;
  /** URLs from this feed included in the deduped batch. */
  items: number;
  /** New rows stored from this feed. Already-seen URLs stay at zero. */
  inserted: number;
  error?: string;
};

type RecordResult = number | { inserted: number; urls: readonly string[] };

export type IngestFeedsDeps = {
  feeds: readonly { name: string; url: string; sector?: string }[];
  fetchXml: (url: string) => Promise<string>;
  record: (
    items: readonly Record<string, unknown>[],
    options?: IngestNewsOptions,
  ) => Promise<RecordResult>;
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

function recordedUrls(
  value: RecordResult,
  batch: readonly Record<string, unknown>[],
): { inserted: number; urls: Set<string> } {
  if (typeof value === "number") {
    const urls = batch.flatMap((item) =>
      typeof item.url === "string" ? [item.url] : [],
    );
    if (value === urls.length) return { inserted: value, urls: new Set(urls) };
    return { inserted: value, urls: new Set() };
  }
  return { inserted: value.inserted, urls: new Set(value.urls) };
}

/** Fetch each configured feed and store new article URLs. One feed failing does not stop the others. Stories are not dropped for being outside AI. */
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
  const owned: string[][] = [];
  for (const row of fetched) {
    if (!row.ok) {
      feeds.push({
        url: row.feed.url,
        name: row.feed.name,
        ok: false,
        fetched: 0,
        items: 0,
        inserted: 0,
        error: row.error,
      });
      owned.push([]);
      continue;
    }
    let count = 0;
    const mine: string[] = [];
    for (const entry of row.entries) {
      if (!entry.url || seen.has(entry.url)) continue;
      seen.add(entry.url);
      items.push({ ...entry, sector: row.feed.sector ?? "ai" });
      mine.push(entry.url);
      count += 1;
    }
    owned.push(mine);
    feeds.push({
      url: row.feed.url,
      name: row.feed.name,
      ok: true,
      fetched: row.entries.length,
      items: count,
      inserted: 0,
    });
  }

  const recorded =
    items.length > 0
      ? await deps.record(items, {
          summaryConcurrency: SUMMARY_CONCURRENCY,
          summaryDeadline: started + (deps.budgetMs ?? INGEST_BUDGET_MS),
        })
      : 0;
  const outcome = recordedUrls(recorded, items);
  for (let index = 0; index < feeds.length; index += 1) {
    const feed = feeds[index];
    const urls = owned[index];
    if (!feed || !urls) continue;
    feed.inserted = urls.filter((url) => outcome.urls.has(url)).length;
  }
  return { inserted: outcome.inserted, feeds };
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
  const { recordFeedNewsResult } = await import("./record");
  return ingestFeeds({
    feeds: await loadNewsFeeds(),
    fetchXml: fetchFeedXml,
    record: (items, options) => recordFeedNewsResult(items, options),
  });
}
