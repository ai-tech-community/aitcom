/** Each community's slice of a member's promotional-broadcast budget for the
 *  window. floor(ceiling / N), min 1 — so no single community can monopolise a
 *  multi-community member's inbox (ADR-0014 fair-share). */
export function perCommunitySubCap(
  nCommunities: number,
  ceiling: number,
): number {
  return Math.max(1, Math.floor(ceiling / Math.max(1, nCommunities)));
}

/** Whether a promotional broadcast from `communityId` may email this member.
 *  `sendsByCommunity` is the member's promotional emails sent THIS window,
 *  keyed by communityId. Enforces the global ceiling and the per-community
 *  sub-cap. Transactional sends never call this (they are exempt). */
export function allowPromotional(opts: {
  sendsByCommunity: Record<string, number>;
  communityId: string;
  nCommunities: number;
  ceiling: number;
}): boolean {
  const { sendsByCommunity, communityId, nCommunities, ceiling } = opts;
  const total = Object.values(sendsByCommunity).reduce((a, b) => a + b, 0);
  if (total >= ceiling) return false; // global ceiling
  const subCap = perCommunitySubCap(nCommunities, ceiling);
  const thisCommunity = sendsByCommunity[communityId] ?? 0;
  return thisCommunity < subCap; // per-community sub-cap
}
