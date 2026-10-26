import type { ComponentType } from "react";

import type { EditorItemView, ItemKindId } from "@/lib/magazines/item-views";
import type { IssueItemInput } from "@/server/magazines/items/registry";

import type { BuilderItem } from "../items-model";

/** One kind's item in the builder's working list. */
export type BuilderItemOf<K extends ItemKindId> = Extract<
  BuilderItem,
  { kind: K }
>;

/**
 * Was a closed union ("article" | "editorial" | …); now every kind id is a
 * label key by construction, so Tasks 4–8 need no edit here — each adds
 * `magazineEditor.builder.items.<kind>` in its copy step.
 */
export type BuilderItemsMessage = ItemKindId | "editorialEmpty" | "openArticle";

/** What "Add more" knows about the content it just put in the issue. */
export type AddedContent = {
  title: string | null;
  openHref: string | null;
};

/** What every kind's "Add more" panel receives. */
export type AddPanelProps = {
  communitySlug: string;
  /** What the issue already references (`builderReferenceKey`). */
  referencesInIssue: ReadonlySet<string>;
  onAdd: (input: IssueItemInput, added: AddedContent) => void;
};

/** What a kind may use to name its row. */
export type BuilderRowContext = {
  /** The item's view from its last save; undefined before its first save. */
  saved: EditorItemView | undefined;
  /** A name given when the item was added (an article's title), if any. */
  titleHint: string | undefined;
  t: (key: BuilderItemsMessage) => string;
};

/** What a kind's own editor gets. The details panel owns Done. */
export type BuilderItemEditorProps<K extends ItemKindId> = {
  item: BuilderItemOf<K>;
  onChange: (patch: Partial<Omit<BuilderItemOf<K>, "kind" | "key">>) => void;
};

/**
 * How the issue builder handles one item kind (ADR-0043): the client twin
 * of the server's `IssueItemKind` and of the reading `ITEM_RENDERERS`.
 * Each kind lives in its own file under `builder/items/`; the builder, the
 * item model and the live preview dispatch through `BUILDER_ITEM_KINDS`
 * and never branch on the kind.
 */
export interface BuilderItemKind<K extends ItemKindId> {
  /** The kind's name in the item list. */
  readonly labelKey: BuilderItemsMessage;
  /** The row's name: what the editor recognises the item by. */
  rowTitle(item: BuilderItemOf<K>, ctx: BuilderRowContext): string;
  /** An editor panel for content the issue owns; absent when it has none. */
  readonly Editor?: ComponentType<BuilderItemEditorProps<K>>;
  /** Whether the server would accept the item as it is now. */
  isSavable(item: BuilderItemOf<K>): boolean;
  /**
   * The view the live preview shows: derived from the working copy, or the
   * item's last saved view. Null while there is nothing to show yet (an
   * article added a moment ago, until its first save).
   */
  previewView(
    item: BuilderItemOf<K>,
    saved: EditorItemView | undefined,
  ): EditorItemView | null;
  /**
   * For kinds that reference content kept elsewhere (an article): the
   * reference, so the same content is in an issue at most once, and the
   * key its edit link is found under.
   */
  referenceKey?(item: BuilderItemOf<K>): string;
  /** The ⋯ menu label for opening the referenced content in its editor. */
  readonly openLabelKey?: BuilderItemsMessage;
  /** The "Add more" panel for this kind. */
  readonly AddPanel: ComponentType<AddPanelProps>;
}
