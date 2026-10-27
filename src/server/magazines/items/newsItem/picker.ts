import { PICKER_LIMIT, type CandidateFact } from "@/lib/magazines/picker";
import { searchNewsItems } from "@/server/news/list";

import { excludedReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemPickerSource } from "../types";
import { newsItemSource } from "./source";

export const newsItemPicker: ItemPickerSource<InputOf<"newsItem">> = {
  async search(query, ctx, exclude) {
    const excludedIds = excludedReferenceIds("newsItem", exclude);
    const items = await searchNewsItems(
      query,
      PICKER_LIMIT,
      ctx.deps.db,
      excludedIds,
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
      };
    });
  },
};
