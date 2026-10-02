import { sql, type SQL } from "drizzle-orm";

import { publicRosterVisibility } from "@/server/members/public-roster";

/**
 * Who is looking at a member's public surfaces (profile page, agent page,
 * inbox profile pane).
 *
 * - `owner`: the signed-in member looking at their own pages. They can always
 *   see them, public or not, so they can check what others will see.
 * - `visitor`: anyone else, signed in or not. They see a member only when the
 *   public roster rule (`publicRosterVisibility`) allows it.
 */
export type ProfileAudience = "owner" | "visitor";

/**
 * What the viewer is told about reach:
 * - `public`: visitors can see this profile.
 * - `owner-only`: only the owner can see it (private, staff-hidden, or
 *   kept off the public roster).
 */
export type ProfileReach = "public" | "owner-only";

export function profileAudience(
  viewerId: string | null | undefined,
  ownerId: string,
): ProfileAudience {
  return viewerId != null && viewerId === ownerId ? "owner" : "visitor";
}

/**
 * The `member_profile` rows this audience may read. Combine with the
 * owner-id filter in the query's WHERE clause. `undefined` means no extra
 * condition (drizzle's `and()` drops it).
 */
export function profileReadableBy(audience: ProfileAudience): SQL | undefined {
  return audience === "owner" ? undefined : publicRosterVisibility();
}

/** Select column: true when visitors can see this profile row. */
export function publiclyVisibleColumn() {
  return sql<boolean>`(${publicRosterVisibility()})`.mapWith(Boolean);
}

export function profileReach(publiclyVisible: boolean): ProfileReach {
  return publiclyVisible ? "public" : "owner-only";
}
