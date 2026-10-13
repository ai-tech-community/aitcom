import { describe, expect, it } from "vitest";

import { mergeNewsFeeds } from "./merge-feeds";

const configured = [
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml" },
  { name: "The Verge — AI", url: "https://www.theverge.com/rss/ai/index.xml" },
];

describe("mergeNewsFeeds", () => {
  it("uses the built-in list when nothing is stored", () => {
    expect(mergeNewsFeeds(configured, [])).toEqual(configured);
  });

  it("skips a built-in feed that staff turned off and keeps one they added", () => {
    expect(
      mergeNewsFeeds(configured, [
        {
          name: "The Verge — AI",
          url: "https://www.theverge.com/rss/ai/index.xml",
          enabled: false,
        },
        {
          name: "Example AI",
          url: "https://example.com/feed.xml",
          enabled: true,
        },
      ]),
    ).toEqual([
      { name: "OpenAI News", url: "https://openai.com/news/rss.xml" },
      { name: "Example AI", url: "https://example.com/feed.xml" },
    ]);
  });

  it("lets a stored row rename a built-in feed", () => {
    expect(
      mergeNewsFeeds(configured, [
        {
          name: "OpenAI",
          url: "https://openai.com/news/rss.xml",
          enabled: true,
        },
      ]),
    ).toEqual([
      { name: "OpenAI", url: "https://openai.com/news/rss.xml" },
      configured[1],
    ]);
  });
});
