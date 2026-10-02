import { countPendingJoinRequests } from "@/server/communities/pending-join-requests";

import type { NextUpContext, NextUpJoinRequestsItem } from "../types";

/**
 * One Next up item per community the member runs that has people waiting
 * for approval (the shared grouped count in `countPendingJoinRequests`).
 */
export async function loadJoinRequestItems(
  ctx: NextUpContext,
): Promise<NextUpJoinRequestsItem[]> {
  const rows = await countPendingJoinRequests(ctx.db, ctx.userId);

  return rows.map((row) => ({
    kind: "joinRequests",
    key: `joinRequests:${row.communityId}`,
    urgency: { tier: "actionNeeded" },
    communityId: row.communityId,
    slug: row.slug,
    name: row.name,
    count: row.count,
  }));
}
