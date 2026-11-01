import { and, eq, isNull, inArray } from "drizzle-orm";
import type { db as database } from "@/server/db";
import {
  communities,
  communityInvites,
  communityMemberships,
  user,
} from "@/server/db/schema";
import {
  ROLE_HIERARCHY,
  type CommunityRole,
} from "@/server/communities/role-utils";

/** Return only presentation data. Never expose the grant role or target email. */
export async function loadInviteLanding(
  db: typeof database,
  token: string,
  viewerId?: string,
  now = new Date(),
) {
  const [invite] = await db
    .select({
      code: communityInvites.code,
      role: communityInvites.role,
      expiresAt: communityInvites.expiresAt,
      maxUses: communityInvites.maxUses,
      useCount: communityInvites.useCount,
      communityId: communities.id,
      communityName: communities.name,
      communitySlug: communities.slug,
      inviterName: user.name,
    })
    .from(communityInvites)
    .innerJoin(communities, eq(communities.id, communityInvites.communityId))
    .innerJoin(user, eq(user.id, communityInvites.createdBy))
    .where(and(eq(communityInvites.code, token), isNull(communities.deletedAt)))
    .limit(1);
  if (invite) {
    if (invite.expiresAt && invite.expiresAt <= now)
      return { kind: "expired" as const };
    const [membership] = viewerId
      ? await db
          .select({
            status: communityMemberships.status,
            role: communityMemberships.role,
          })
          .from(communityMemberships)
          .where(
            and(
              eq(communityMemberships.communityId, invite.communityId),
              eq(communityMemberships.userId, viewerId),
            ),
          )
          .limit(1)
      : [];
    const alreadyMember =
      membership?.status === "active" &&
      ROLE_HIERARCHY[membership.role as CommunityRole] >=
        ROLE_HIERARCHY[(invite.role ?? "member") as CommunityRole];
    if (
      !alreadyMember &&
      invite.maxUses !== null &&
      invite.useCount >= invite.maxUses
    )
      return { kind: "expired" as const };
    return {
      kind: "valid" as const,
      communityName: invite.communityName,
      communitySlug: invite.communitySlug,
      inviterName: invite.inviterName,
      alreadyMember,
    };
  }
  const [community] = await db
    .select({ name: communities.name, slug: communities.slug })
    .from(communities)
    .where(
      and(
        eq(communities.slug, token),
        isNull(communities.deletedAt),
        inArray(communities.joinPolicy, ["open", "approval_required"]),
      ),
    )
    .limit(1);
  return community
    ? {
        kind: "valid" as const,
        communityName: community.name,
        communitySlug: community.slug,
        inviterName: null,
        alreadyMember: false,
      }
    : { kind: "invalid" as const };
}
