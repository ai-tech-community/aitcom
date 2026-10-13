export type NewsFeedAddress = {
  name: string;
  url: string;
};

export type StoredNewsFeed = NewsFeedAddress & {
  enabled: boolean;
};

/**
 * Built-in feeds, minus any the table has turned off, plus feeds staff added.
 * A stored row wins on name and enabled. An empty table is the built-in list.
 */
export function mergeNewsFeeds(
  configured: readonly NewsFeedAddress[],
  stored: readonly StoredNewsFeed[],
): NewsFeedAddress[] {
  const storedByUrl = new Map(stored.map((feed) => [feed.url, feed]));
  const seen = new Set<string>();
  const merged: NewsFeedAddress[] = [];
  for (const feed of configured) {
    seen.add(feed.url);
    const row = storedByUrl.get(feed.url);
    if (row?.enabled === false) continue;
    merged.push({ name: row?.name ?? feed.name, url: feed.url });
  }
  for (const row of stored) {
    if (seen.has(row.url) || !row.enabled) continue;
    merged.push({ name: row.name, url: row.url });
  }
  return merged;
}
