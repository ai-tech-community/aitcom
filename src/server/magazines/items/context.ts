import type { AppLocale } from "@/i18n/messages";
import type { IssueReaderAccess } from "@/lib/magazines/access";
import type { Magazine } from "@/payload-types";

import type { Deps } from "../deps";
import { magazineTopicsOf, normalizeTopics } from "../magazine-service";
import { createItemReader } from "./reader";
import type { ItemCommunity, ItemContext, SuggestContext } from "./types";

/** One editor-side context for all sources, with normalized magazine topics. */
export function suggestContextFor(
  deps: Deps,
  opts: {
    magazine: Magazine;
    community: ItemCommunity & { name: string };
    viewerId: string;
    locale: AppLocale;
    now: Date;
  },
): SuggestContext {
  const { magazine, ...viewer } = opts;
  return {
    deps,
    ...viewer,
    magazineId: magazine.id,
    topics: normalizeTopics(magazineTopicsOf(magazine)),
  };
}

/** One item context, shared by every kind loaded for this issue and viewer. */
export function itemContextFor(
  deps: Deps,
  opts: {
    magazineId: number;
    community: ItemCommunity;
    issueId: number | null;
    locale: AppLocale;
    access: IssueReaderAccess;
    viewerId: string | null;
  },
): ItemContext {
  const { viewerId, ...issue } = opts;
  return {
    payload: deps.payload,
    db: deps.db,
    ...issue,
    reader: createItemReader(deps.db, viewerId),
  };
}
