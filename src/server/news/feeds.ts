/**
 * Reputable AI news feeds. Each URL was checked to answer with an RSS or
 * Atom document. The news table stays empty until a run of
 * `GET /api/cron/news-feeds` fetches these. Nothing here is invented copy.
 */
export const NEWS_FEEDS = [
  {
    name: "MIT Technology Review — Artificial intelligence",
    url: "https://www.technologyreview.com/topic/artificial-intelligence/feed/",
  },
  {
    name: "The Verge — AI",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
  },
  {
    name: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
  },
  {
    name: "Google AI blog",
    url: "https://blog.google/innovation-and-ai/technology/ai/rss/",
  },
] as const;

/** Newest entries kept from each feed on one run. */
export const NEWS_FEED_ITEM_LIMIT = 8;
