const windows = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;

export function checkRateLimit(agentId: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const window = windows.get(agentId);

  if (!window || now > window.resetAt) {
    const resetAt = now + WINDOW_MS;
    windows.set(agentId, { count: 1, resetAt });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt };
  }

  if (window.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: window.resetAt };
  }

  window.count++;
  return {
    allowed: true,
    remaining: MAX_REQUESTS - window.count,
    resetAt: window.resetAt,
  };
}
