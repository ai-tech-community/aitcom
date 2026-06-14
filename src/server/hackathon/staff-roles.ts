// Pure per-hackathon role math (per-hackathon staff grants). Db-free so it is
// unit-testable; the tRPC gates do the membership + grant lookups and call these.
import {
  isCommunityHackathonAdmin,
  type MembershipRow,
} from "./community-admin";

export type StaffRole = "organizer" | "judge";

export interface StaffGrantRow {
  role: StaffRole;
  revokedAt: Date | null;
}

export type HackathonCapability = "admin" | "organizer" | "judge" | null;

/** True iff `grants` contains a non-revoked grant of `role`. */
export function hasActiveGrant(
  grants: StaffGrantRow[],
  role: StaffRole,
): boolean {
  return grants.some((g) => g.role === role && g.revokedAt === null);
}

/**
 * Highest management capability the user holds for one hackathon:
 * community owner/admin > organizer grant > judge grant > none.
 * NOTE: ranking is gated on `hasActiveGrant(grants, "judge")` directly — an
 * admin is NOT implicitly a judge.
 */
export function resolveHackathonCapability(
  membership: MembershipRow | null | undefined,
  grants: StaffGrantRow[],
): HackathonCapability {
  if (isCommunityHackathonAdmin(membership ?? null)) return "admin";
  if (hasActiveGrant(grants, "organizer")) return "organizer";
  if (hasActiveGrant(grants, "judge")) return "judge";
  return null;
}
