import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { NEWS_FEED_ITEM_LIMIT, NEWS_FEEDS } from "./feeds";
import { ingestFeeds } from "./ingest-feeds";

const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>A real headline</title>
    <link>https://example.com/story</link>
    <pubDate>Mon, 12 Oct 2026 00:00:00 GMT</pubDate>
    <description>The excerpt.</description>
  </item>
  <item>
    <title>Second</title>
    <link>https://example.com/two</link>
  </item>
</channel></rss>`;

describe("configured news feeds", () => {
  it("lists only https feeds and does not seed stories in the migration", () => {
    expect(NEWS_FEEDS.length).toBe(60);
    expect(NEWS_FEEDS.length).toBeLessThanOrEqual(80);
    expect(new Set(NEWS_FEEDS.map((feed) => feed.url)).size).toBe(
      NEWS_FEEDS.length,
    );
    for (const feed of NEWS_FEEDS) {
      expect(feed.url.startsWith("https://")).toBe(true);
      expect(feed.name.trim().length).toBeGreaterThan(0);
    }
    const migration = readFileSync(
      join(process.cwd(), "src/migrations/20261013a_news_rumors.ts"),
      "utf8",
    );
    expect(migration).not.toMatch(/INSERT INTO/i);
    expect(migration).toContain("news_rumor");
  });

  it("stores parsed entries and keeps going when one feed fails", async () => {
    const recorded: Record<string, unknown>[][] = [];
    const result = await ingestFeeds({
      feeds: [
        { name: "Broken", url: "https://broken.example/feed" },
        { name: "Ok", url: "https://ok.example/feed" },
      ],
      limit: 1,
      fetchXml: async (url) => {
        if (url.includes("broken")) throw new Error("timeout");
        return rss;
      },
      record: async (items) => {
        recorded.push([...items]);
        return items.length;
      },
    });
    expect(result.inserted).toBe(1);
    expect(result.feeds[0]).toMatchObject({ ok: false, items: 0 });
    expect(result.feeds[1]).toMatchObject({ ok: true, items: 1 });
    expect(recorded).toEqual([
      [
        expect.objectContaining({
          title: "A real headline",
          url: "https://example.com/story",
        }),
      ],
    ]);
  });

  it("dedupes a URL shared by two feeds and keeps the first", async () => {
    const batches: Record<string, unknown>[][] = [];
    const result = await ingestFeeds({
      feeds: [
        { name: "First", url: "https://first.example/feed" },
        { name: "Second", url: "https://second.example/feed" },
      ],
      limit: 5,
      fetchXml: async () => rss,
      record: async (items) => {
        batches.push([...items]);
        return items.length;
      },
    });
    expect(result.inserted).toBe(2);
    expect(result.feeds.map((feed) => feed.items)).toEqual([2, 0]);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });

  it("asks the store to stop summaries when the budget is already spent", async () => {
    let deadline = Number.POSITIVE_INFINITY;
    await ingestFeeds({
      feeds: [{ name: "Ok", url: "https://ok.example/feed" }],
      budgetMs: 0,
      now: () => 1_000,
      fetchXml: async () => rss,
      record: async (_items, options) => {
        deadline = options?.summaryDeadline ?? Number.POSITIVE_INFINITY;
        return 1;
      },
    });
    expect(deadline).toBe(1_000);
  });

  it("caps each feed at the configured item limit", () => {
    expect(NEWS_FEED_ITEM_LIMIT).toBeGreaterThanOrEqual(15);
  });
});
