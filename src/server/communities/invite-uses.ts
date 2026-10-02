import { and, eq, sql } from "drizzle-orm";

import { communityInvites } from "@/server/db/schema";
import type { Tx } from "./activate-membership";

/**
 * Uses up one use of an invite link. A link with a use limit is only
 * counted while it is under that limit (atomic: two redeemers racing for
 * the last use cannot both get it). Returns false when the limit is
 * reached. Run it inside the activation's transaction, so a use is only
 * spent when the member really joins.
 */
export async function consumeInviteUse(
  tx: Tx,
  invite: { id: string; maxUses: number | null },
): Promise<boolean> {
  const counted = await tx
    .update(communityInvites)
    .set({ useCount: sql`${communityInvites.useCount} + 1` })
    .where(
      and(
        eq(communityInvites.id, invite.id),
        invite.maxUses === null
          ? undefined
          : sql`${communityInvites.useCount} < ${invite.maxUses}`,
      ),
    )
    .returning({ id: communityInvites.id });
  return counted.length > 0;
}
