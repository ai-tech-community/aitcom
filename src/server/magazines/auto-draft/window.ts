import type { AutoDraftLookBack } from "@/lib/magazines/auto-draft";
import {
  lookBackWindow,
  type SuggestWindow,
} from "@/lib/magazines/auto-draft-schedule";

import type { Deps } from "../deps";

/** Suggestions start at the magazine's latest publication, never a later draft. */
export async function suggestWindowFor(
  deps: Deps,
  magazineId: number,
  lookBack: AutoDraftLookBack,
  now: Date,
): Promise<SuggestWindow> {
  const { docs } = await deps.payload.find({
    collection: "magazine-issues",
    where: {
      and: [
        { magazine: { equals: magazineId } },
        { status: { equals: "published" } },
        { publishedAt: { exists: true } },
      ],
    },
    sort: "-publishedAt",
    select: { publishedAt: true },
    depth: 0,
    limit: 1,
    pagination: false,
  });
  const publishedAt = docs[0]?.publishedAt;
  return lookBackWindow(
    lookBack,
    publishedAt ? new Date(publishedAt) : null,
    now,
  );
}
