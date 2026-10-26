import { PICKER_LIMIT, type CandidateFact } from "@/lib/magazines/picker";
import { listStorylines } from "@/server/news/storylines";

import type { InputOf } from "../registry";
import type { ItemPickerSource } from "../types";

export const storylinePicker: ItemPickerSource<InputOf<"storyline">> = {
  async search(query, ctx) {
    const { items } = await listStorylines({ q: query, limit: PICKER_LIMIT });
    return items.map((story) => {
      const facts: CandidateFact[] = [
        { type: "count", what: "sources", value: story.articleCount },
      ];
      if (story.latestAt)
        facts.push({ type: "date", label: "updated", at: story.latestAt });
      return {
        input: { kind: "storyline", storylineId: story.id },
        title:
          ctx.locale === "nl" && story.titleNl.trim()
            ? story.titleNl
            : story.titleEn,
        facts,
        openHref: null,
      };
    });
  },
};
