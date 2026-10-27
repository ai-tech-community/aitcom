import { suggestNewsItems } from "@/server/news/list";

import { excludedReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemSuggestionSource } from "../types";
import { newsItemCandidate } from "./picker";

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
    return items.map((news) => ({
      ...newsItemCandidate(news),
      reason: { type: "topic", topic: news.matchedTopic },
    }));
  },
};
