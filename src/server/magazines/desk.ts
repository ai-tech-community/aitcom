import { and, eq, isNull } from "drizzle-orm";

import type { Magazine } from "@/payload-types";
import { communities } from "@/server/db/schema";

import type { Deps } from "./deps";
import { loadMagazineEditorship, type MagazineStanding } from "./editorship";
import { getMagazineForCommunity } from "./magazine-service";

export type MagazineDesk = {
  community: {
    id: string;
    slug: string;
    name: string;
    isListedInDirectory: boolean;
  };
  magazine: Magazine | null;
  standing: MagazineStanding;
};

/** Null when there is no live community with this slug. */
export async function loadMagazineDesk(
  deps: Deps,
  opts: { communitySlug: string; viewerId: string | null },
): Promise<MagazineDesk | null> {
  const community = await deps.db.query.communities.findFirst({
    where: and(
      eq(communities.slug, opts.communitySlug),
      isNull(communities.deletedAt),
    ),
    columns: { id: true, slug: true, name: true, isListedInDirectory: true },
  });
  if (!community) return null;
  const magazine = await getMagazineForCommunity(deps.payload, community.id);
  const standing = await loadMagazineEditorship(
    deps.db,
    { communityId: community.id, magazineId: magazine?.id ?? null },
    opts.viewerId,
  );
  return { community, magazine, standing };
}
