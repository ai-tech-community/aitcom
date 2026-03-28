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
