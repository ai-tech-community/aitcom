import type { IssueItemView, ItemKindId } from "@/lib/magazines/item-views";

/** The URL of a magazine article in the issue being read, by its slug. */
export type ArticleHref = (articleSlug: string) => string;

/** The view of one item kind. */
export type ItemViewOfKind<K extends ItemKindId> = Extract<
  IssueItemView,
  { kind: K }
>;

/** What every item renderer gets (ADR-0043: one renderer per kind). */
export type ItemRendererProps<K extends ItemKindId> = {
  view: ItemViewOfKind<K>;
  /** The issue's lead item: a wider card with a larger heading. */
  lead: boolean;
  href: ArticleHref;
};

/** The item's title in the issue's contents list, or null when it has none. */
export type ItemTitle<K extends ItemKindId> = (
  view: ItemViewOfKind<K>,
) => string | null;
