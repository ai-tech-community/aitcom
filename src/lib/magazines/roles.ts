/** Magazine roles in display order. Callers ask for capabilities instead. */
export const MAGAZINE_ROLES = [
  "editor_in_chief",
  "editor",
  "contributor",
] as const;
export type MagazineRole = (typeof MAGAZINE_ROLES)[number];

/** The role community owners/admins hold implicitly in their magazine (Decision 5). */
export const COMMUNITY_LEADER_ROLE: MagazineRole = "editor_in_chief";

export const MAGAZINE_CAPABILITIES = ["write", "edit", "manage"] as const;
export type MagazineCapability = (typeof MAGAZINE_CAPABILITIES)[number];

const CAPABILITIES: Record<MagazineRole, ReadonlySet<MagazineCapability>> = {
  editor_in_chief: new Set(["write", "edit", "manage"]),
  editor: new Set(["write", "edit"]),
  contributor: new Set(["write"]),
};

export function roleCan(
  role: MagazineRole | null,
  capability: MagazineCapability,
): boolean {
  return role !== null && CAPABILITIES[role].has(capability);
}

/** Roles granting a capability, in display order, for SQL filters. */
export function rolesWith(
  capability: MagazineCapability,
): readonly MagazineRole[] {
  return MAGAZINE_ROLES.filter((role) => roleCan(role, capability));
}

export type MagazineHandIn = "mark_ready" | "send_for_review";

/** The one hand-in decision: writers with edit mark ready; others send in. */
export function handInFor(canEdit: boolean): MagazineHandIn {
  return canEdit ? "mark_ready" : "send_for_review";
}

export function isMagazineRole(value: string): value is MagazineRole {
  return (MAGAZINE_ROLES as readonly string[]).includes(value);
}
