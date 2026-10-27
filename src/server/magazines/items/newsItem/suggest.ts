import type { CandidateFact } from "@/lib/magazines/picker";
import { suggestNewsItems } from "@/server/news/list";

import { excludedReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemSuggestionSource } from "../types";
import { newsItemSource } from "./source";

export const newsItemSuggester: ItemSuggestionSource<InputOf<"newsItem">> = {
  async suggest(ctx, window, config) {
    const items = await suggestNewsItems(
      {
        topics: ctx.topics,
        ...window,
        limit: config.limit,
        exclude: excludedReferenceIds("newsItem", config.exclude),
      },
      ctx.deps.db,
    );
    return items.map((news) => {
      const { source } = newsItemSource(news.url);
      const facts: CandidateFact[] = [];
      if (source) facts.push({ type: "source", host: source });
      if (news.publishedAt)
        facts.push({
          type: "date",
          label: "published",
          at: news.publishedAt.toISOString(),
        });
      return {
        input: { kind: "newsItem", newsItemId: news.id },
        title: news.title,
        facts,
        openHref: null,
        reason: { type: "topic", topic: news.matchedTopic },
      };
    });
  },
};
