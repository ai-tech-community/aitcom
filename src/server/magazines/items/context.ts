import type { AppLocale } from "@/i18n/messages";
import type { IssueReaderAccess } from "@/lib/magazines/access";

import type { Deps } from "../deps";
import { createItemReader } from "./reader";
import type { ItemCommunity, ItemContext } from "./types";

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
