import { z } from "zod";

import { extractPlainText } from "@/lib/lexical";
import type { ItemProblem } from "@/lib/magazines/item-views";

import { itemIdOf } from "../item-id";
import type { IssueItemKind, ItemViewOf, StoredItem } from "../types";

const editorialItemInput = z.object({
  kind: z.literal("editorial"),
  id: z.string().optional(),
  heading: z.string().max(160).optional(),
  /** Lexical editor state; `validate` checks it holds some text. */
  body: z.unknown(),
  intro: z.string().max(280).optional(),
});

export type EditorialItemInput = z.infer<typeof editorialItemInput>;
export type EditorialItemStored = StoredItem<"editorial">;

/** Whether a Lexical state has at least one non-empty text node. */
function hasText(body: unknown): boolean {
  const children = (body as { root?: { children?: unknown } } | null)?.root
    ?.children;
  if (!Array.isArray(children)) return false;
  return (
    extractPlainText(children as Parameters<typeof extractPlainText>[0])
      .length > 0
  );
}

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
      intro: input.intro ?? null,
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
      ...(stored.intro ? { intro: stored.intro } : {}),
    };
  },

  async validate(items) {
    const problems: ItemProblem[] = [];
    for (const { index, stored } of items) {
      if (!hasText(stored.body)) {
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
