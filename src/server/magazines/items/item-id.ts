/**
 * The id of a saved issue item: its Payload block id. Payload gives every
 * saved block one; the reading page anchors and the builder keys use it.
 */
export function itemIdOf(stored: { id?: string | null }): string {
  if (!stored.id) throw new Error("A saved issue item has no block id");
  return stored.id;
}
