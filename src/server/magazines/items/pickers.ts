import { forumThreadPicker } from "./forumThread/picker";
import { eventPicker } from "./event/picker";
import {
  AUTO_DRAFT_SOURCES,
  AUTO_DRAFT_SOURCE_ORDER,
} from "@/lib/magazines/auto-draft";
import type { SuggestWindow } from "@/lib/magazines/auto-draft-schedule";
import { PICKER_LIMIT, type PickableKindId } from "@/lib/magazines/picker";
import type { SuggestionReason } from "@/lib/magazines/suggestions";

import { storylinePicker } from "./storyline/picker";
import { newsItemPicker } from "./newsItem/picker";
import { launchpadProjectPicker } from "./launchpadProject/picker";
import { articlePicker } from "./article/picker";
import { referenceOfInput, type InputOf } from "./registry";
import { suggestCandidates } from "./suggesters";
import type {
  ItemPickerSource,
  PickerCandidate,
  PickerContext,
  SuggestContext,
} from "./types";

export const ITEM_PICKERS: {
  [K in PickableKindId]: ItemPickerSource<InputOf<K>>;
} = {
  article: articlePicker,
  storyline: storylinePicker,
  newsItem: newsItemPicker,
  event: eventPicker,
  forumThread: forumThreadPicker,
  launchpadProject: launchpadProjectPicker,
};

/** Search one source and attach the kind strategy's content identity. */
export async function searchPickerCandidates<K extends PickableKindId>(
  kind: K,
  query: string,
  ctx: PickerContext,
  exclude: readonly string[] = [],
): Promise<PickerCandidate<InputOf<K>>[]> {
  const candidates = await ITEM_PICKERS[kind].search(query, ctx, exclude);
  return candidates.map((candidate) => {
    const reference = referenceOfInput(kind, candidate.input);
    if (reference === null) {
      throw new Error("A pickable item must have a reference");
    }
    return { ...candidate, reference };
  });
}

export type PickerSuggestion = { reason: SuggestionReason | null };
export type SuggestionLoader = () => Promise<{
  ctx: SuggestContext;
  window: SuggestWindow;
}>;

/** Empty searches lead with suggestions; typed searches keep their own order. */
export async function pickerCandidatesFor<K extends PickableKindId>(
  kind: K,
  query: string,
  ctx: PickerContext,
  exclude: readonly string[],
  loadSuggestion: SuggestionLoader,
): Promise<(PickerCandidate<InputOf<K>> & PickerSuggestion)[]> {
  if (query) {
    return (await searchPickerCandidates(kind, query, ctx, exclude)).map(
      (candidate) => ({ ...candidate, reason: null }),
    );
  }

  const suggestion = await loadSuggestion();
  const candidates = new Map<
    string,
    PickerCandidate<InputOf<K>> & PickerSuggestion
  >();
  for (const source of AUTO_DRAFT_SOURCE_ORDER) {
    if (AUTO_DRAFT_SOURCES[source].kind !== kind) continue;
    const suggested = await suggestCandidates(
      source,
      suggestion.ctx,
      suggestion.window,
      { limit: PICKER_LIMIT, exclude },
    );
    for (const candidate of suggested) {
      // The source's kind was checked above; its input belongs to this picker.
      const input = candidate.input as InputOf<K>;
      const reference = referenceOfInput(kind, input);
      if (reference === null) {
        throw new Error("A pickable item must have a reference");
      }
      if (!candidates.has(reference)) {
        candidates.set(reference, { ...candidate, input, reference });
      }
    }
  }

  if (candidates.size < PICKER_LIMIT) {
    const searched = await searchPickerCandidates(kind, query, ctx, exclude);
    for (const candidate of searched) {
      const existing = candidates.get(candidate.reference);
      if (existing) {
        existing.openHref ??= candidate.openHref;
      } else if (candidates.size < PICKER_LIMIT) {
        candidates.set(candidate.reference, { ...candidate, reason: null });
      }
    }
  }
  return [...candidates.values()].slice(0, PICKER_LIMIT);
}
