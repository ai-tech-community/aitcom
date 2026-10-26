import type { ReactNode } from "react";

import type { EditorItemView, ItemKindId } from "@/lib/magazines/item-views";

import type { BuilderItem } from "../items-model";
import { storylineBuilderKind } from "./storyline";
import { newsItemBuilderKind } from "./news-item";
import { articleBuilderKind } from "./article";
import { editorialBuilderKind } from "./editorial";
import type {
  BuilderItemEditorProps,
  BuilderItemKind,
  BuilderItemOf,
  BuilderItemsMessage,
  BuilderRowContext,
} from "./types";

export type { BuilderItemOf, BuilderRowContext } from "./types";

/**
 * One builder strategy per item kind (ADR-0043), the client twin of the
 * server's `ITEM_KINDS` and the reading `ITEM_RENDERERS`. A kind without a
 * builder strategy is a type error. The functions below dispatch through
 * this record; nothing in the builder switches on the kind.
 */
export const BUILDER_ITEM_KINDS: { [K in ItemKindId]: BuilderItemKind<K> } = {
  article: articleBuilderKind,
  editorial: editorialBuilderKind,
  storyline: storylineBuilderKind,
  newsItem: newsItemBuilderKind,
};

/**
 * The "Add more" tabs, one per kind. Each later kind inserts its id here.
 * A permutation of `BUILDER_ITEM_KINDS`: a kind without a tab is a test failure.
 */
export const ADD_TAB_ORDER: readonly ItemKindId[] = [
  "article",
  "storyline",
  "newsItem",
  "editorial",
];

function kindOf<K extends ItemKindId>(
  item: BuilderItemOf<K>,
): BuilderItemKind<K> {
  return BUILDER_ITEM_KINDS[item.kind];
}

/** The row's name in the item list. */
export function builderRowTitle<K extends ItemKindId>(
  item: BuilderItemOf<K>,
  ctx: BuilderRowContext,
): string {
  return kindOf(item).rowTitle(item, ctx);
}

/** The kind's name in the item list, as a message key. */
export function builderKindLabelKey(item: BuilderItem): BuilderItemsMessage {
  return BUILDER_ITEM_KINDS[item.kind].labelKey;
}

/** Whether the server would accept the item as it is now. */
export function isSavableBuilderItem<K extends ItemKindId>(
  item: BuilderItemOf<K>,
): boolean {
  return kindOf(item).isSavable(item);
}

/** What the live preview shows for the item, or null while it waits. */
export function builderPreviewView<K extends ItemKindId>(
  item: BuilderItemOf<K>,
  saved: EditorItemView | undefined,
): EditorItemView | null {
  return kindOf(item).previewView(item, saved);
}

/** The content the item references (at most once per issue), or null. */
export function builderReferenceKey<K extends ItemKindId>(
  item: BuilderItemOf<K>,
): string | null {
  return kindOf(item).referenceKey?.(item) ?? null;
}

/** The ⋯ menu label for opening the item's referenced content, or null. */
export function builderOpenLabelKey(
  item: BuilderItem,
): BuilderItemsMessage | null {
  return BUILDER_ITEM_KINDS[item.kind].openLabelKey ?? null;
}

/** Whether the kind has an editor panel in the builder. */
export function hasBuilderItemEditor(item: BuilderItem): boolean {
  return BUILDER_ITEM_KINDS[item.kind].Editor !== undefined;
}

/** The kind's editor panel for the item, or null when it has none. */
export function renderBuilderItemEditor<K extends ItemKindId>(
  item: BuilderItemOf<K>,
  handlers: Omit<BuilderItemEditorProps<K>, "item">,
): ReactNode {
  const Editor = kindOf(item).Editor;
  return Editor ? <Editor item={item} {...handlers} /> : null;
}
