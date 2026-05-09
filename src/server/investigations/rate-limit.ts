const WINDOW_MS = 3_600_000;
export const EDIT_LIMIT_PER_HOUR = 20;
export const VOTE_LIMIT_PER_HOUR = 60;

interface Bucket {
  count: number;
  resetAt: number;
}

const editBuckets = new Map<string, Bucket>();
const voteBuckets = new Map<string, Bucket>();

function check(map: Map<string, Bucket>, key: string, max: number) {
  const now = Date.now();
  const bucket = map.get(key);
  if (!bucket || now >= bucket.resetAt) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: max - 1 };
  }
  if (bucket.count >= max) {
    return { allowed: false, remaining: 0 };
  }
  bucket.count++;
  return { allowed: true, remaining: max - bucket.count };
}

export function checkInvestigationEditLimit(userId: string) {
  return check(editBuckets, userId, EDIT_LIMIT_PER_HOUR);
}

export function checkInvestigationVoteLimit(userId: string) {
  return check(voteBuckets, userId, VOTE_LIMIT_PER_HOUR);
}

export function __resetInvestigationLimits() {
  editBuckets.clear();
  voteBuckets.clear();
}
