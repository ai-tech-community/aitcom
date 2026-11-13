/**
 * Roles that moderate a community's content: they see and act on hidden
 * posts and gallery items. Pure, so the server (who may moderate) and the
 * browser (which controls to show) share one rule.
 */
const COMMUNITY_MODERATOR_ROLES: ReadonlySet<string> = new Set([
  "owner",
  "admin",
  "moderator",
]);

export function isModeratorRole(role: string | null | undefined): boolean {
  return role != null && COMMUNITY_MODERATOR_ROLES.has(role);
}
