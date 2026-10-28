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

export function pinThreadDenialMessage(
  denial: Exclude<ReturnType<typeof pinThreadDenial>, null>,
): string {
  if (denial === "not_community") {
    return "Only moderators of a community can pin its threads";
  }
  return "Only moderators can pin threads";
}
