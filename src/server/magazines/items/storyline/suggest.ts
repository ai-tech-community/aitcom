import type { CandidateFact } from "@/lib/magazines/picker";
import { suggestPublicStorylines } from "@/server/news/storylines";

import { excludedReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemSuggestionSource } from "../types";

export const storylineSuggester: ItemSuggestionSource<InputOf<"storyline">> = {
  async suggest(ctx, window, config) {
    const stories = await suggestPublicStorylines(
      {
        topics: ctx.topics,
        since: window.since,
        limit: config.limit,
        exclude: excludedReferenceIds("storyline", config.exclude),
      },
      ctx.deps.db,
    );
    return stories.map((story) => {
      const facts: CandidateFact[] = [
        { type: "count", what: "sources", value: story.articleCount },
      ];
      if (story.latestAt)
        facts.push({
          type: "date",
          label: "updated",
          at: story.latestAt.toISOString(),
        });
      return {
        input: { kind: "storyline", storylineId: story.id },
        title:
          ctx.locale === "nl" && story.titleNl.trim()
            ? story.titleNl
            : story.titleEn,
        facts,
        openHref: null,
        reason: { type: "topic", topic: story.matchedTopic },
      };
    });
  },
};
