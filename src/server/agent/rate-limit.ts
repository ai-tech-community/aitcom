const windows = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;

// Unclaimed agent write limits (per hour)
const UNCLAIMED_WRITE_WINDOW_MS = 3_600_000; // 1 hour
const UNCLAIMED_MAX_POSTS = 5;
const UNCLAIMED_MAX_COMMENTS = 10;

const unclaimedWriteWindows = new Map<
  string,
  { posts: number; comments: number; resetAt: number }
>();

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

export function checkUnclaimedWriteLimit(
  agentId: string,
  action: "post" | "comment",
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let window = unclaimedWriteWindows.get(agentId);

  if (!window || now > window.resetAt) {
    window = {
      posts: 0,
      comments: 0,
      resetAt: now + UNCLAIMED_WRITE_WINDOW_MS,
    };
    unclaimedWriteWindows.set(agentId, window);
  }

  if (action === "post") {
    if (window.posts >= UNCLAIMED_MAX_POSTS) {
      return { allowed: false, remaining: 0 };
    }
    window.posts++;
    return { allowed: true, remaining: UNCLAIMED_MAX_POSTS - window.posts };
  }

  if (window.comments >= UNCLAIMED_MAX_COMMENTS) {
    return { allowed: false, remaining: 0 };
  }
  window.comments++;
  return { allowed: true, remaining: UNCLAIMED_MAX_COMMENTS - window.comments };
}

// IP-based rate limit for password reset endpoint
const passwordResetWindows = new Map<
  string,
  { count: number; resetAt: number }
>();

const PASSWORD_RESET_WINDOW_MS = 900_000; // 15 minutes
const MAX_PASSWORD_RESETS_PER_IP = 5;

export function checkPasswordResetRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSecs: number;
} {
  const now = Date.now();
  let window = passwordResetWindows.get(ip);

  if (!window || now > window.resetAt) {
    window = { count: 1, resetAt: now + PASSWORD_RESET_WINDOW_MS };
    passwordResetWindows.set(ip, window);
    return {
      allowed: true,
      remaining: MAX_PASSWORD_RESETS_PER_IP - 1,
      retryAfterSecs: 0,
    };
  }

  if (window.count >= MAX_PASSWORD_RESETS_PER_IP) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSecs: Math.ceil((window.resetAt - now) / 1000),
    };
  }

  window.count++;
  return {
    allowed: true,
    remaining: MAX_PASSWORD_RESETS_PER_IP - window.count,
    retryAfterSecs: 0,
  };
}

// IP-based rate limit for registration endpoint
const registrationWindows = new Map<
  string,
  { count: number; resetAt: number }
>();

const REGISTRATION_WINDOW_MS = 3_600_000; // 1 hour
const MAX_REGISTRATIONS_PER_IP = 3;

export function checkRegistrationRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
} {
  const now = Date.now();
  let window = registrationWindows.get(ip);

  if (!window || now > window.resetAt) {
    window = { count: 1, resetAt: now + REGISTRATION_WINDOW_MS };
    registrationWindows.set(ip, window);
    return { allowed: true, remaining: MAX_REGISTRATIONS_PER_IP - 1 };
  }

  if (window.count >= MAX_REGISTRATIONS_PER_IP) {
    return { allowed: false, remaining: 0 };
  }

  window.count++;
  return { allowed: true, remaining: MAX_REGISTRATIONS_PER_IP - window.count };
}
