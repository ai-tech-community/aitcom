export type OptoutRow = {
  communityId: string | null; // null = global
  category: "digest" | "broadcast";
};

export type ResolvedPrefs = {
  globalDigestOptOut: boolean;
  digestOptOutCommunityIds: Set<string>;
  broadcastOptOutCommunityIds: Set<string>;
};

/** Fold sparse opt-OUT rows into resolved preferences. Absence of a row means
 *  opted in (digests default opt-in, ADR-0014). */
export function resolvePrefs(rows: OptoutRow[]): ResolvedPrefs {
  const resolved: ResolvedPrefs = {
    globalDigestOptOut: false,
    digestOptOutCommunityIds: new Set(),
    broadcastOptOutCommunityIds: new Set(),
  };
  for (const row of rows) {
    if (row.category === "digest" && row.communityId === null) {
      resolved.globalDigestOptOut = true;
    } else if (row.category === "digest" && row.communityId) {
      resolved.digestOptOutCommunityIds.add(row.communityId);
    } else if (row.category === "broadcast" && row.communityId) {
      resolved.broadcastOptOutCommunityIds.add(row.communityId);
    }
  }
  return resolved;
}
