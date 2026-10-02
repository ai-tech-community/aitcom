import { and, eq, sql, type SQL } from "drizzle-orm";

import type { db as appDb } from "@/server/db";
import { memberProfiles } from "@/server/db/schema";
import {
  notHiddenByStaff,
  publicRosterVisibility,
} from "@/server/members/public-roster";

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
 * Whether visitors can see a profile, and if not, why — told to the owner
 * so the notice can point at the right fix.
 * - `private`: the member turned their profile off; Settings fixes it.
 * - `hiddenByStaff`: staff keep it off the public roster; Settings does not.
 */
export type ProfileReach =
  | { kind: "public" }
  | { kind: "ownerOnly"; reason: "private" | "hiddenByStaff" };

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

/** Columns `profileReach` needs; spread into a `member_profile` select. */
export function profileReachColumns() {
  return {
    isPublic: memberProfiles.isPublic,
    hiddenByStaff: sql<boolean>`not (${notHiddenByStaff()})`.mapWith(Boolean),
  };
}

export function profileReach(row: {
  isPublic: boolean;
  hiddenByStaff: boolean;
}): ProfileReach {
  // Staff hiding wins: turning the profile public would not help.
  if (row.hiddenByStaff) return { kind: "ownerOnly", reason: "hiddenByStaff" };
  if (!row.isPublic) return { kind: "ownerOnly", reason: "private" };
  return { kind: "public" };
}

/** Who is looking, and whether visitors can see the profile. */
export interface ProfileGate {
  audience: ProfileAudience;
  reach: ProfileReach;
}

/**
 * The one visibility check for a member's public surfaces that are loaded on
 * their own (identity panel communities, Activity, Work): null when this
 * viewer may not see the profile (or it does not exist), otherwise who is
 * looking and whether visitors can see it. Same rule as the profile itself.
 */
export async function loadProfileGate(
  database: typeof appDb,
  { userId, viewerId }: { userId: string; viewerId: string | null | undefined },
): Promise<ProfileGate | null> {
  const audience = profileAudience(viewerId, userId);
  const [row] = await database
    .select(profileReachColumns())
    .from(memberProfiles)
    .where(and(eq(memberProfiles.userId, userId), profileReadableBy(audience)))
    .limit(1);
  return row ? { audience, reach: profileReach(row) } : null;
}
