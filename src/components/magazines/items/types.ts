import type { ReactNode } from "react";

import type { IssueItemView, ItemKindId } from "@/lib/magazines/item-views";

/** The URL of a magazine article in the issue being read, by its slug. */
export type ArticleHref = (articleSlug: string) => string;

/** The view of one item kind. */
export type ItemViewOfKind<K extends ItemKindId> = Extract<
  IssueItemView,
  { kind: K }
>;

export type ItemTeaser = { inlinePrompt: ReactNode };

export type ItemSize = "lead" | "card" | "row";

/** What every item renderer gets (ADR-0043: one renderer per kind). */
export type ItemRendererProps<K extends ItemKindId> = {
  view: ItemViewOfKind<K>;
  size: ItemSize;
  href: ArticleHref;
  teaser: ItemTeaser | null;
};

/** The item's title in the issue's contents list, or null when it has none. */
export type ItemTitle<K extends ItemKindId> = (
  view: ItemViewOfKind<K>,
) => string | null;
