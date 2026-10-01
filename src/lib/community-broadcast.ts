/** The roles that may announce to a whole community. */
export const BROADCASTER_ROLES = ["owner", "admin"] as const;

/**
 * Whether a member with `role` may send their community an announcement
 * (in the app and by email): the Broadcast tool and "@everyone" in a post
 * share this one rule, on the server and in the editor. Owners and admins
 * only.
 */
export function canBroadcast(role: string | null | undefined): boolean {
  return (BROADCASTER_ROLES as readonly string[]).includes(role ?? "");
}
