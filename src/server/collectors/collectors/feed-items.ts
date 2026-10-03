import { z } from "zod";

import type { Collector } from "../collector";
import { CollectorStop } from "../errors";
import { type FeedEntry, NotAFeedError, parseFeed } from "../helpers/feed";

const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5";

const inputSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2_048),
});

const itemSchema = z.object({
  title: z.string(),
  url: z.string().nullable(),
  publishedAt: z.string().nullable(),
  author: z.string().nullable(),
  summary: z.string(),
});

export const feedItems: Collector<z.infer<typeof inputSchema>, FeedEntry> = {
  id: "feed-items",
  version: 1,
  author: "platform",
  kind: "feed",
  title: { en: "Feed items", nl: "Feeditems" },
  description: {
    en: "The latest items of an RSS or Atom feed: title, link, date, author and a short summary.",
    nl: "De nieuwste items van een RSS- of Atom-feed: titel, link, datum, auteur en een korte samenvatting.",
  },
  inputSchema,
  itemSchema,
  fieldHints: {
    url: {
      label: { en: "Feed address", nl: "Feedadres" },
      help: {
        en: "The web address of the RSS or Atom feed.",
        nl: "Het webadres van de RSS- of Atom-feed.",
      },
      placeholder: "https://example.com/feed.xml",
    },
  },
  sampleItem: {
    title: "Release notes for March",
    url: "https://example.com/blog/march",
    publishedAt: "2026-03-01T09:00:00.000Z",
    author: "Example Team",
    summary: "What changed this month.",
  },
  limits: { maxPages: 1, maxItems: 1_000, maxDurationMs: 60_000 },
  async *run(input, ctx) {
    const res = await ctx.fetch(input.url, { accept: FEED_ACCEPT });
    if (res.status < 200 || res.status >= 300) {
      throw new CollectorStop(
        "error",
        "failed",
        `The feed answered with status ${res.status}.`,
      );
    }
    let entries: FeedEntry[];
    try {
      entries = parseFeed(await res.text(), res.url);
    } catch (err) {
      if (err instanceof NotAFeedError) {
        throw new CollectorStop(
          "error",
          "failed",
          "This address is not an RSS or Atom feed.",
        );
      }
      throw err;
    }
    ctx.log(`Found ${entries.length} items.`);
    yield* entries;
  },
};
