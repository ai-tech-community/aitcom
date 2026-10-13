import { describe, expect, it, vi } from "vitest";

import { addVerifiedNewsFeed, submitVerifiedNewsItem } from "./submit";

const story = {
  url: "https://example.com/story",
  title: "A real headline",
  source: "Example",
  published_at: "2026-10-13T12:00:00.000Z",
  summary: "The excerpt from the article.",
};

const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>A real headline</title>
    <link>https://example.com/story</link>
  </item>
</channel></rss>`;

describe("submitVerifiedNewsItem", () => {
  it("stores a story whose URL resolves", async () => {
    const record = vi.fn(async () => 1);
    const result = await submitVerifiedNewsItem(story, {
      resolveUrl: async () => true,
      record,
    });
    expect(result).toEqual({
      ok: true,
      inserted: true,
      url: "https://example.com/story",
    });
    expect(record).toHaveBeenCalledWith([
      expect.objectContaining({
        url: "https://example.com/story",
        title: "A real headline",
        author: "Example",
        summary: "The excerpt from the article.",
        publishedAt: "2026-10-13T12:00:00.000Z",
      }),
    ]);
  });

  it("reports a duplicate URL without storing it again", async () => {
    const result = await submitVerifiedNewsItem(story, {
      resolveUrl: async () => true,
      record: async () => 0,
    });
    expect(result).toEqual({
      ok: true,
      inserted: false,
      url: "https://example.com/story",
    });
  });

  it("rejects a missing summary, a bad date, and a URL that does not resolve", async () => {
    const record = vi.fn(async () => 1);
    const deps = { resolveUrl: async () => true, record };
    expect(
      (await submitVerifiedNewsItem({ ...story, summary: "  " }, deps)).ok,
    ).toBe(false);
    expect(
      (await submitVerifiedNewsItem({ ...story, published_at: "soon" }, deps))
        .ok,
    ).toBe(false);
    expect(
      await submitVerifiedNewsItem(story, {
        resolveUrl: async () => false,
        record,
      }),
    ).toMatchObject({ ok: false, status: 422 });
    expect(record).not.toHaveBeenCalled();
  });
});

describe("addVerifiedNewsFeed", () => {
  it("stores a feed that parses and ignores a duplicate URL", async () => {
    const insert = vi
      .fn<() => Promise<"inserted" | "duplicate">>()
      .mockResolvedValueOnce("inserted")
      .mockResolvedValueOnce("duplicate");
    const deps = { fetchXml: async () => rss, insert };
    const input = { name: "Example", url: "https://example.com/feed.xml" };
    expect(await addVerifiedNewsFeed(input, deps)).toMatchObject({
      ok: true,
      inserted: true,
    });
    expect(await addVerifiedNewsFeed(input, deps)).toMatchObject({
      ok: true,
      inserted: false,
    });
  });

  it("does not store a URL that is not a feed", async () => {
    const insert = vi.fn();
    const result = await addVerifiedNewsFeed(
      { name: "Example", url: "https://example.com/page" },
      { fetchXml: async () => "<html></html>", insert },
    );
    expect(result).toMatchObject({ ok: false, status: 422 });
    expect(insert).not.toHaveBeenCalled();
  });
});
