/** Pure room-access predicates (no DB). */

export function canJoinDirectly(
  visibility: "public" | "private" | null | undefined,
): boolean {
  return visibility === "public";
}

export function isActiveMember(
  membership: { status: "active" | "pending_request" } | null | undefined,
): boolean {
  return membership?.status === "active";
}

/** Slugify a room name and append a short id suffix for per-community uniqueness. */
export function roomSlugFromName(name: string, suffix: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "room"}-${suffix}`;
}
