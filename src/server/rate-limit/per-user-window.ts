/**
 * A per-member limit on how often one action may run in a time window,
 * kept in memory on each server instance. Enough to stop one member from
 * using up a shared outside quota or hammering an expensive action; it is
 * not a global limit across instances.
 */
export type PerUserLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSecs: number;
};

export function createPerUserLimit({
  windowMs,
  max,
  now = () => Date.now(),
}: {
  windowMs: number;
  max: number;
  now?: () => number;
}): (userId: string) => PerUserLimitResult {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return (userId) => {
    const at = now();
    const window = windows.get(userId);

    if (!window || at > window.resetAt) {
      windows.set(userId, { count: 1, resetAt: at + windowMs });
      return { allowed: true, remaining: max - 1, retryAfterSecs: 0 };
    }

    if (window.count >= max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSecs: Math.ceil((window.resetAt - at) / 1000),
      };
    }

    window.count++;
    return { allowed: true, remaining: max - window.count, retryAfterSecs: 0 };
  };
}
