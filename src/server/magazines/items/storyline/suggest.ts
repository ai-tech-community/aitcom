import { suggestPublicStorylines } from "@/server/news/storylines";

import { excludedReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemSuggestionSource } from "../types";
import { storylineCandidate } from "./picker";

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
    return stories.map((story) => ({
      ...storylineCandidate(story, ctx),
      reason: { type: "topic", topic: story.matchedTopic },
    }));
  },
};
