// Per-user rate limit for the event link-importer. The importer makes
// outbound fetches and can create media docs, so we cap how often a single
// user can trigger it. In-memory (per server instance), matching the pattern
// in src/server/benchmark/user-rate-limit.ts.
const importWindows = new Map<string, { count: number; resetAt: number }>();

const IMPORT_WINDOW_MS = 3_600_000; // 1 hour
const IMPORT_MAX_PER_HOUR = 20;

export function checkEventImportRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSecs: number;
} {
  const now = Date.now();
  const window = importWindows.get(userId);

  if (!window || now > window.resetAt) {
    importWindows.set(userId, {
      count: 1,
      resetAt: now + IMPORT_WINDOW_MS,
    });
    return {
      allowed: true,
      remaining: IMPORT_MAX_PER_HOUR - 1,
      retryAfterSecs: 0,
    };
  }

  if (window.count >= IMPORT_MAX_PER_HOUR) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSecs: Math.ceil((window.resetAt - now) / 1000),
    };
  }

  window.count++;
  return {
    allowed: true,
    remaining: IMPORT_MAX_PER_HOUR - window.count,
    retryAfterSecs: 0,
  };
}
