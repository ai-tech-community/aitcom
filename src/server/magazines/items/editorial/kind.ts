import { z } from "zod";

import { lexicalHasText } from "@/lib/lexical-text";
import type { ItemProblem } from "@/lib/magazines/item-views";

import { introInput, itemBaseInput, storedIntro } from "../base-input";
import { itemIdOf } from "../item-id";
import type { IssueItemKind, ItemViewOf, StoredItem } from "../types";

const editorialItemInput = z.object({
  kind: z.literal("editorial"),
  ...itemBaseInput,
  heading: z.string().max(160).optional(),
  /** Lexical editor state; `validate` checks it holds some text. */
  body: z.unknown(),
});

export type EditorialItemInput = z.infer<typeof editorialItemInput>;
export type EditorialItemStored = StoredItem<"editorial">;

/**
 * Free-form text owned by the issue (an editor's column, a section opener).
 * Everything it shows lives in the block itself.
 */
export const editorialItemKind: IssueItemKind<
  "editorial",
  EditorialItemInput,
  EditorialItemStored
> = {
  kind: "editorial",
  input: editorialItemInput,

  toStored(input) {
    return {
      intro: storedIntro(input.intro),
      heading: input.heading ?? null,
      // The editor state is checked by `validate` and Payload's richText
      // field; its exact Lexical shape is the editor's business.
      body: input.body as EditorialItemStored["body"],
    };
  },

  toInput(stored) {
    return {
      kind: "editorial",
      ...(stored.id ? { id: stored.id } : {}),
      ...(stored.heading ? { heading: stored.heading } : {}),
      body: stored.body,
      ...introInput(stored.intro),
    };
  },

  referenceOf: () => null,

  async validate(items) {
    const problems: ItemProblem[] = [];
    for (const { index, stored } of items) {
      if (!lexicalHasText(stored.body)) {
        problems.push({ itemIndex: index, code: "ITEM_INVALID" });
      }
    }
    return problems;
  },

  async load(items) {
    const views = new Map<string, ItemViewOf<"editorial">>();
    for (const stored of items) {
      const itemId = itemIdOf(stored);
      views.set(itemId, {
        kind: "editorial",
        itemId,
        intro: stored.intro ?? null,
        heading: stored.heading ?? null,
        body: stored.body,
      });
    }
    return views;
  },

  // The issue's own text: every level that may read the issue reads it.
  isReadable: (_view, ctx) => {
    switch (ctx.access) {
      case "full":
      case "editor":
        return true;
    }
  },
};
