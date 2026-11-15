export type CommunityRole = "owner" | "admin" | "moderator" | "member";

export const ROLE_HIERARCHY: Record<CommunityRole, number> = {
  owner: 4,
  admin: 3,
  moderator: 2,
  member: 1,
} as const;

/**
 * Returns true if `actorRole` can manage (promote/demote/ban/remove) a user with `targetRole`.
 * Rule: you can only manage roles strictly below yours.
 */
export function canManageRole(
  actorRole: CommunityRole,
  targetRole: CommunityRole,
): boolean {
  return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole];
}

/**
 * Whether an active role runs the community's membership: owner, admin or
 * moderator. They review join requests and bans, so only they may list
 * members who are not active.
 */
export function isCommunityManagerRole(
  role: CommunityRole | null | undefined,
): boolean {
  return role != null && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.moderator;
}

export { BROADCASTER_ROLES, canBroadcast } from "@/lib/community-broadcast";
