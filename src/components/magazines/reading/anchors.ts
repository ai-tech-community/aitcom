/**
 * In-page anchors of the issue reading view. The contents list links to
 * them and the layouts put them on the items, so both sides use these.
 */

/** The editor's note. */
export const EDITOR_NOTE_ANCHOR = "from-the-editor";

/** One issue item, by its block id. */
export function itemAnchorId(itemId: string): string {
  return `item-${itemId}`;
}
