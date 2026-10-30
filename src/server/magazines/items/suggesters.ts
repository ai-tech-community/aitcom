import {
  AUTO_DRAFT_SOURCES,
  type AutoDraftSourceId,
  type SourceKind,
} from "@/lib/magazines/auto-draft";
import type { SuggestWindow } from "@/lib/magazines/auto-draft-schedule";

import { articleSuggester } from "./article/suggest";
import { welcomeSuggester } from "./editorial/suggest";
import { eventSuggester } from "./event/suggest";
import { forumThreadSuggester } from "./forumThread/suggest";
import { launchpadProjectSuggester } from "./launchpadProject/suggest";
import { newsItemSuggester } from "./newsItem/suggest";
import { referenceOfInput, type InputOf } from "./registry";
import { storylineSuggester } from "./storyline/suggest";
import type {
  ItemSuggestionSource,
  SuggestConfig,
  SuggestContext,
  SuggestionSourceCandidate,
} from "./types";

export const ITEM_SUGGESTERS: {
  [S in AutoDraftSourceId]: ItemSuggestionSource<InputOf<SourceKind<S>>>;
} = {
  article: articleSuggester,
  storyline: storylineSuggester,
  newsItem: newsItemSuggester,
  event: eventSuggester,
  forumThread: forumThreadSuggester,
  launchpadProject: launchpadProjectSuggester,
  welcome: welcomeSuggester,
};

export type SuggestedCandidate<Input> = SuggestionSourceCandidate<Input> & {
  reference: string | null;
};

/** Ask one named source and attach its kind's content identity. */
export async function suggestCandidates<S extends AutoDraftSourceId>(
  source: S,
  ctx: SuggestContext,
  window: SuggestWindow,
  config: SuggestConfig,
): Promise<SuggestedCandidate<InputOf<SourceKind<S>>>[]> {
  if (config.limit <= 0) return [];
  const candidates = await ITEM_SUGGESTERS[source].suggest(ctx, window, config);
  return candidates.map((candidate) => ({
    ...candidate,
    reference: referenceOfInput(
      AUTO_DRAFT_SOURCES[source].kind,
      candidate.input,
    ),
  }));
}
