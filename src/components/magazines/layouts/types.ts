import type { ReactNode } from "react";

import type { EditorItemView } from "@/lib/magazines/item-views";

import type { ArticleHref } from "../items/types";

/** What every issue layout gets: the items in issue order and the note. */
export type LayoutProps = {
  items: EditorItemView[];
  href: ArticleHref;
  /** The editor's note card, placed by the layout; null when there is none. */
  editorNote: ReactNode;
};
