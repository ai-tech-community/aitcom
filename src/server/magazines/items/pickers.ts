import { eventPicker } from "./event/picker";
import type { PickableKindId } from "@/lib/magazines/picker";

import { storylinePicker } from "./storyline/picker";
import { newsItemPicker } from "./newsItem/picker";
import { articlePicker } from "./article/picker";
import { ITEM_KINDS, type InputOf } from "./registry";
import type {
  ItemPickerSource,
  PickerCandidate,
  PickerContext,
  StoredItem,
} from "./types";

export const ITEM_PICKERS: {
  [K in PickableKindId]: ItemPickerSource<InputOf<K>>;
} = {
  article: articlePicker,
  storyline: storylinePicker,
  newsItem: newsItemPicker,
  event: eventPicker,
};

/** Search one source and attach the kind strategy's content identity. */
export async function searchPickerCandidates<K extends PickableKindId>(
  kind: K,
  query: string,
  ctx: PickerContext,
): Promise<PickerCandidate<InputOf<K>>[]> {
  const candidates = await ITEM_PICKERS[kind].search(query, ctx);
  const strategy = ITEM_KINDS[kind];
  return candidates.map((candidate) => {
    // toStored omits only the optional block id; references identify content.
    const stored = strategy.toStored(candidate.input) as StoredItem<K>;
    const reference = strategy.referenceOf(stored);
    if (reference === null) {
      throw new Error("A pickable item must have a reference");
    }
    return { ...candidate, reference };
  });
}
