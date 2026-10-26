import { and, eq } from "drizzle-orm";

import type { CommunityRole } from "@/server/communities/role-utils";
import type { db } from "@/server/db";
import { communityMemberships } from "@/server/db/schema";

/**
 * The role a membership row grants: its role while the membership is
 * active, else null. The one "active membership" rule; pure, so the read
 * scope (`buildIssueReadScope`) applies it to rows it already loaded.
 */
export function activeRoleOf(
  membership: { role: CommunityRole; status: string } | null | undefined,
): CommunityRole | null {
  return membership?.status === "active" ? membership.role : null;
}

/**
 * The user's role in a community while their membership is active; null
 * for anonymous viewers, non-members and pending, invited or banned
 * members. The one membership read behind every magazine role decision
 * (`isMagazineEditorRole`, `resolveMagazineIssueAccess`). It does not look
 * at the community itself: callers decide what a missing or soft-deleted
 * community means.
 */
export async function activeCommunityRole(
  database: typeof db,
  communityId: string,
  userId: string | null,
): Promise<CommunityRole | null> {
  if (userId === null) return null;
  const membership = await database.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, communityId),
      eq(communityMemberships.userId, userId),
    ),
    columns: { role: true, status: true },
  });
  return activeRoleOf(membership);
}
