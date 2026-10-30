/** Roles that see Pin and Lock on a community thread. */
const THREAD_MODERATOR_ROLES = new Set(["owner", "admin", "moderator"]);

export function roleCanModerateThreads(
  role: string | null | undefined,
): boolean {
  return role != null && THREAD_MODERATOR_ROLES.has(role);
}

/**
 * Whether this member may set a thread's pin.
 * Community threads follow the pin control in the forum UI.
 * Hub threads have no community role. The browser procedure still allows a
 * signed-in member to pin them; the MCP tool does not (`allowHubThread`).
 */
export function pinThreadDenial(input: {
  communityId: string | null | undefined;
  role: string | null;
  allowHubThread: boolean;
}): "not_community" | "forbidden" | null {
  if (!input.communityId) {
    return input.allowHubThread ? null : "not_community";
  }
  return roleCanModerateThreads(input.role) ? null : "forbidden";
}

/**
 * A pin only changes a live thread: it is still in the forum, and if it
 * belongs to a community that community has not been removed. An agent
 * draft is not a thread until the owner approves it, so it is not live.
 */
export function forumThreadIsLive(
  thread:
    | { isDeleted?: boolean | null; communityId?: string | null }
    | null
    | undefined,
  community: { deletedAt: Date | null } | null,
): boolean {
  if (!thread || thread.isDeleted) return false;
  if (!thread.communityId) return true;
  return community !== null && community.deletedAt === null;
}

export function pinThreadDenialMessage(
  denial: Exclude<ReturnType<typeof pinThreadDenial>, null>,
): string {
  if (denial === "not_community") {
    return "Only moderators of a community can pin its threads";
  }
  return "Only moderators can pin threads";
}
