import type { ItemKindId } from "./item-views";

/** A content reference shared by the item strategies and the builder. */
export function itemReference(kind: ItemKindId, id: string | number): string {
  return `${kind}:${id}`;
}
