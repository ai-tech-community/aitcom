// src/server/benchmark/user-rate-limit.ts
const suggestWindows = new Map<
  string,
  { count: number; resetAt: number }
>();

const SUGGEST_WINDOW_MS = 3_600_000; // 1 hour
const SUGGEST_MAX_PER_HOUR = 10;

export function checkSuggestPromptsRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSecs: number;
} {
  const now = Date.now();
  const window = suggestWindows.get(userId);

  if (!window || now > window.resetAt) {
    suggestWindows.set(userId, {
      count: 1,
      resetAt: now + SUGGEST_WINDOW_MS,
    });
    return {
      allowed: true,
      remaining: SUGGEST_MAX_PER_HOUR - 1,
      retryAfterSecs: 0,
    };
  }

  if (window.count >= SUGGEST_MAX_PER_HOUR) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSecs: Math.ceil((window.resetAt - now) / 1000),
    };
  }

  window.count++;
  return {
    allowed: true,
    remaining: SUGGEST_MAX_PER_HOUR - window.count,
    retryAfterSecs: 0,
  };
}

const strategyWindows = new Map<string, { count: number; resetAt: number }>();
const STRATEGY_WINDOW_MS = 3_600_000;
const STRATEGY_MAX_PER_HOUR = 5;

export function checkStrategyRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSecs: number;
} {
  const now = Date.now();
  const window = strategyWindows.get(userId);
  if (!window || now > window.resetAt) {
    strategyWindows.set(userId, { count: 1, resetAt: now + STRATEGY_WINDOW_MS });
    return { allowed: true, remaining: STRATEGY_MAX_PER_HOUR - 1, retryAfterSecs: 0 };
  }
  if (window.count >= STRATEGY_MAX_PER_HOUR) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSecs: Math.ceil((window.resetAt - now) / 1000),
    };
  }
  window.count++;
  return { allowed: true, remaining: STRATEGY_MAX_PER_HOUR - window.count, retryAfterSecs: 0 };
}
