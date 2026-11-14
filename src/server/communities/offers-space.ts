import { and, eq, isNotNull } from "drizzle-orm";

import { paymentOffers, spaces } from "@/server/db/schema";

import type { Tx } from "./activate-membership";

/**
 * The first published offer shows the community's Offers tab, like creating
 * a magazine adds the Magazine tab. Call inside the publish transaction,
 * before the offer is marked published: when the community has no published
 * offer yet, a hidden `offers` builtin space is shown. Once something is
 * published, a tab the owner hid stays hidden.
 *
 * Returns true when the tab changed from hidden to shown.
 */
export async function showOffersSpaceOnFirstPublish(
  tx: Tx,
  communityId: string,
): Promise<boolean> {
  const [published] = await tx
    .select({ id: paymentOffers.id })
    .from(paymentOffers)
    .where(
      and(
        eq(paymentOffers.communityId, communityId),
        eq(paymentOffers.published, true),
      ),
    )
    .limit(1);
  if (published) return false;

  const shown = await tx
    .update(spaces)
    .set({ archivedAt: null })
    .where(
      and(
        eq(spaces.communityId, communityId),
        eq(spaces.kind, "builtin"),
        eq(spaces.builtinSurface, "offers"),
        isNotNull(spaces.archivedAt),
      ),
    )
    .returning({ id: spaces.id });
  return shown.length > 0;
}
