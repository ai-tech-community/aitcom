export function communityInvitePath(token: string): `/invite/${string}` {
  return `/invite/${encodeURIComponent(token)}`;
}

export function isExpiredInvite(expiresAt: string | Date | null | undefined) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
}

export function isMaxedOutInvite(useCount: number, maxUses: number | null) {
  return maxUses !== null && useCount >= maxUses;
}
