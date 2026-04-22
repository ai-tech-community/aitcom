const windows = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

export function checkPublicApiRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSecs: number;
} {
  const now = Date.now();
  const window = windows.get(ip);

  if (!window || now > window.resetAt) {
    windows.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1, retryAfterSecs: 0 };
  }

  if (window.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSecs: Math.ceil((window.resetAt - now) / 1000),
    };
  }

  window.count++;
  return {
    allowed: true,
    remaining: MAX_REQUESTS - window.count,
    retryAfterSecs: 0,
  };
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export function isSameOriginRequest(req: Request): boolean {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "same-site") return true;
  return false;
}
