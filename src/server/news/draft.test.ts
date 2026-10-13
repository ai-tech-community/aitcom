import { describe, expect, it } from "vitest";

import { newsArticleUrl, newsDraftsFromFeed } from "./draft";

describe("newsArticleUrl", () => {
  it("keeps an http(s) article and drops the fragment", () => {
    expect(newsArticleUrl("https://example.com/story#top")).toBe(
      "https://example.com/story",
    );
  });

  it("rejects missing and non-http addresses", () => {
    expect(newsArticleUrl(null)).toBeNull();
    expect(newsArticleUrl("javascript:alert(1)")).toBeNull();
    expect(newsArticleUrl("not a url")).toBeNull();
  });
});

describe("newsDraftsFromFeed", () => {
  it("keeps the first copy of an article and skips rows without a link", () => {
    const drafts = newsDraftsFromFeed([
      {
        title: "First",
        url: "https://example.com/a#x",
        publishedAt: "2026-10-11T09:00:00.000Z",
        author: "Ada",
        summary: "A short summary.",
      },
      {
        title: "Duplicate",
        url: "https://example.com/a",
        publishedAt: null,
        author: null,
        summary: "Later copy.",
      },
      {
        title: "No link",
        url: null,
        publishedAt: null,
        author: null,
        summary: "",
      },
    ]);
    expect(drafts).toEqual([
      {
        url: "https://example.com/a",
        title: "First",
        author: "Ada",
        publishedAt: new Date("2026-10-11T09:00:00.000Z"),
        summary: "A short summary.",
      },
    ]);
  });
});
