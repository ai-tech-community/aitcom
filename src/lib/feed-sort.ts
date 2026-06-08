export const MAX_PINS = 3;

/**
 * Stable reorder: pinned items first (in their original relative order),
 * then the rest (in their original relative order). Applied client-side
 * only on the "All" view — topic-filtered views do not pin.
 */
export function orderPinnedFirst<T extends { isPinned?: boolean | null }>(
  items: T[],
): T[] {
  const pinned = items.filter((i) => i.isPinned === true);
  const rest = items.filter((i) => i.isPinned !== true);
  return [...pinned, ...rest];
}
