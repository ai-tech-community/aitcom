import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { NEWS_FEEDS } from "./feeds";
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
    expect(NEWS_FEEDS.length).toBeGreaterThan(0);
    for (const feed of NEWS_FEEDS) {
      expect(feed.url.startsWith("https://")).toBe(true);
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
    expect(result.feeds[0]).toMatchObject({ ok: false });
    expect(recorded).toEqual([
      [
        expect.objectContaining({
          title: "A real headline",
          url: "https://example.com/story",
        }),
      ],
    ]);
  });
});
