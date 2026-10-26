import { z } from "zod";

import type { UnavailableItem } from "@/lib/magazines/item-views";
import { itemReference } from "@/lib/magazines/references";
import {
  loadStorylineCards,
  type StorylineCard,
} from "@/server/news/storylines";

import {
  cutWords,
  introInput,
  itemBaseInput,
  storedIntro,
} from "../base-input";
import { itemIdOf } from "../item-id";
import { validateReferences } from "../references";
import type {
  IssueItemKind,
  ItemContext,
  ItemViewOf,
  StoredItem,
} from "../types";

const storylineItemInput = z.object({
  kind: z.literal("storyline"),
  ...itemBaseInput,
  storylineId: z.string().min(1).max(255),
});

type StorylineItemInput = z.infer<typeof storylineItemInput>;
type StorylineItemStored = StoredItem<"storyline">;

/** Both current access levels read live stories, under the same public rule. */
function cardsFor(
  items: StorylineItemStored[],
  ctx: ItemContext,
): Promise<Map<string, StorylineCard>> {
  switch (ctx.access) {
    case "full":
    case "editor":
      return loadStorylineCards(
        items.map((item) => item.storylineId),
        ctx.db,
      );
  }
}

const referenceOf = (stored: StorylineItemStored) =>
  itemReference("storyline", stored.storylineId);

export const storylineItemKind: IssueItemKind<
  "storyline",
  StorylineItemInput,
  StorylineItemStored
> = {
  kind: "storyline",
  input: storylineItemInput,
  toStored: (input) => ({
    intro: storedIntro(input.intro),
    storylineId: input.storylineId,
  }),
  toInput: (stored) => ({
    kind: "storyline",
    ...(stored.id ? { id: stored.id } : {}),
    storylineId: stored.storylineId,
    ...introInput(stored.intro),
  }),
  referenceOf,
  async validate(items, ctx) {
    const cards = await loadStorylineCards(
      items.map((item) => item.stored.storylineId),
      ctx.db,
    );
    return validateReferences(items, {
      referenceOf,
      acceptNew: (stored) => cards.get(stored.storylineId)?.isPublic === true,
    });
  },
  async load(items, ctx) {
    const cards = await cardsFor(items, ctx);
    const views = new Map<string, ItemViewOf<"storyline"> | UnavailableItem>();
    for (const stored of items) {
      const itemId = itemIdOf(stored);
      const card = cards.get(stored.storylineId);
      if (!card?.isPublic) {
        views.set(itemId, {
          kind: "storyline",
          itemId,
          unavailable: true,
          reason: card ? "unpublished" : "missing",
        });
      } else {
        const title =
          ctx.locale === "nl" && card.titleNl.trim()
            ? card.titleNl
            : card.titleEn;
        const overview =
          ctx.locale === "nl" && card.overviewNl.trim()
            ? card.overviewNl
            : card.overviewEn;
        views.set(itemId, {
          kind: "storyline",
          itemId,
          intro: stored.intro ?? null,
          storyline: {
            slug: card.slug,
            title,
            overview: cutWords(overview, 40),
            sourceCount: card.articleCount,
            updatedAt: card.latestAt?.toISOString() ?? null,
          },
        });
      }
    }
    return views;
  },
  isReadable: (_view, ctx) => {
    switch (ctx.access) {
      case "full":
      case "editor":
        return true;
    }
  },
};
