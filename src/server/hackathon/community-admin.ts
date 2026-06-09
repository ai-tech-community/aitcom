// Pure role predicate for operating a community hackathon (ADR-0031): an active
// owner|admin of the community may edit/publish/lock/finalize. Kept db-free so it
// is unit-testable; the tRPC gate does the membership lookup and calls this.
export interface MembershipRow {
  status: string;
  role: string;
}

export function isCommunityHackathonAdmin(
  membership: MembershipRow | null | undefined,
): boolean {
  if (!membership || membership.status !== "active") return false;
  return membership.role === "owner" || membership.role === "admin";
}
