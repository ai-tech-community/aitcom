import { PICKER_LIMIT, type CandidateFact } from "@/lib/magazines/picker";
import {
  searchPublicStorylines,
  type StorylineCard,
} from "@/server/news/storylines";

import { excludedReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type {
  ItemPickerSource,
  PickerContext,
  PickerSourceCandidate,
} from "../types";

export function storylineCandidate(
  story: StorylineCard,
  ctx: PickerContext,
): PickerSourceCandidate<InputOf<"storyline">> {
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
  };
}

export const storylinePicker: ItemPickerSource<InputOf<"storyline">> = {
  async search(query, ctx, exclude) {
    const excludedIds = excludedReferenceIds("storyline", exclude);
    const items = await searchPublicStorylines(
      query,
      PICKER_LIMIT,
      ctx.deps.db,
      excludedIds,
    );
    return items.map((story) => storylineCandidate(story, ctx));
  },
};
