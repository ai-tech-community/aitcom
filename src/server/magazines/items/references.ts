import type { ItemProblem } from "@/lib/magazines/item-views";

/** New references must be acceptable; saved references only need to be unique. */
export function validateReferences<Stored>(
  items: readonly { index: number; stored: Stored; isNew: boolean }[],
  opts: {
    referenceOf: (stored: Stored) => string;
    acceptNew: (stored: Stored) => boolean;
  },
): ItemProblem[] {
  const seen = new Set<string>();
  const problems: ItemProblem[] = [];
  for (const { index, stored, isNew } of items) {
    const reference = opts.referenceOf(stored);
    if (seen.has(reference)) {
      problems.push({
        itemIndex: index,
        code: "ITEM_INVALID",
        detail: "duplicate",
      });
    } else if (isNew && !opts.acceptNew(stored)) {
      problems.push({ itemIndex: index, code: "ITEM_INVALID" });
    }
    seen.add(reference);
  }
  return problems;
}
