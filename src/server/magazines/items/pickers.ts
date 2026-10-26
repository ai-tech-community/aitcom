import type { PickableKindId } from "@/lib/magazines/picker";

import { articlePicker } from "./article/picker";
import { ITEM_KINDS, type InputOf, type IssueItemInput } from "./registry";
import type { ItemPickerSource, PickerCandidate, PickerContext } from "./types";

export const ITEM_PICKERS: {
  [K in PickableKindId]: ItemPickerSource<InputOf<K>>;
} = {
  article: articlePicker,
};

/** Search one source and attach the kind strategy's content identity. */
export async function searchPickerCandidates(
  kind: PickableKindId,
  query: string,
  ctx: PickerContext,
): Promise<PickerCandidate<IssueItemInput>[]> {
  const candidates = await ITEM_PICKERS[kind].search(query, ctx);
  const strategy = ITEM_KINDS[kind];
  return candidates.map((candidate) => {
    const reference = strategy.referenceOf(strategy.toStored(candidate.input));
    if (reference === null) {
      throw new Error("A pickable item must have a reference");
    }
    return { ...candidate, reference };
  });
}
