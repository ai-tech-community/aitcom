import { queryMyCommunities } from "@/server/communities/my-communities";

import type { NextUpContext, NextUpInviteItem } from "../types";

/**
 * Communities that invited the member and are waiting for an answer: the
 * My communities rows with status "invited" (deleted communities are
 * already left out there).
 */
export async function loadInviteItems(
  ctx: NextUpContext,
): Promise<NextUpInviteItem[]> {
  const memberships = await queryMyCommunities(ctx.db, ctx.userId);
  return memberships
    .filter((m) => m.status === "invited")
    .map((m) => ({
      kind: "invite",
      key: `invite:${m.communityId}`,
      urgency: { tier: "actionNeeded" },
      communityId: m.communityId,
      slug: m.slug,
      name: m.name,
    }));
}
