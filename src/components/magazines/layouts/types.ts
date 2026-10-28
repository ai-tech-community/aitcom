import type { EditorItemView } from "@/lib/magazines/item-views";

import type { ArticleHref, ItemTeaser } from "../items/types";

/**
 * What every issue layout gets: the items in issue order. The editor's note
 * is not the layout's: it opens the issue in the hero above every layout.
 */
export type LayoutProps = {
  items: EditorItemView[];
  href: ArticleHref;
  teaser: ItemTeaser | null;
};
