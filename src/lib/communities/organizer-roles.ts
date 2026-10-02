/**
 * Roles that run a community: they open its settings, manage it and review
 * join requests. Matches who `communities/[slug]/settings` admits. Shared by
 * the server (who counts as a reviewer) and the dashboard (which rows show
 * Manage and join requests), so the two never disagree.
 */
export const COMMUNITY_ORGANIZER_ROLES = ["owner", "admin"] as const;

export type CommunityOrganizerRole = (typeof COMMUNITY_ORGANIZER_ROLES)[number];

export function isCommunityOrganizer(
  role: string,
): role is CommunityOrganizerRole {
  return (COMMUNITY_ORGANIZER_ROLES as readonly string[]).includes(role);
}
