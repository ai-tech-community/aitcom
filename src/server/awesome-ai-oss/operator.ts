import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";
import { HUB_SLUG } from "@/server/communities/hub";

export async function userIsHubOperator(userId: string): Promise<boolean> {
  const hub = await db.query.communities.findFirst({
    where: and(eq(communities.slug, HUB_SLUG), isNull(communities.deletedAt)),
  });
  if (!hub) return false;
  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, hub.id),
      eq(communityMemberships.userId, userId),
    ),
  });
  const role = membership?.status === "active" ? membership.role : null;
  return role === "owner" || role === "admin";
}
