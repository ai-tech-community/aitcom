import { sanitizeRedirect } from "@/lib/auth-redirect";
import { HUB_COMMUNITY_PATH } from "@/lib/join-path";

export type AuthUrlEnv = {
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_BASE_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
  PORT?: string;
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
  VERCEL_BRANCH_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
};

/** Canonical production host. Apex is also accepted when explicitly configured. */
export const CANONICAL_PRODUCTION_ORIGIN = "https://www.aitcommunity.org";

/** Cookie Domain so www and apex share `__Secure-better-auth.session_token`. */
export const PRODUCTION_COOKIE_DOMAIN = "aitcommunity.org";

/** Canonical production hosts. Preview deploys still need these trusted. */
const PRODUCTION_APP_ORIGINS = [
  "https://aitcommunity.org",
  "https://www.aitcommunity.org",
] as const;

function trimValue(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

/** Hostname or URL → origin. Vercel system vars have no scheme. */
function toOrigin(value?: string) {
  const trimmed = trimValue(value);
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
      .origin;
  } catch {
    return undefined;
  }
}

export function isProductionAppOrigin(value?: string) {
  const origin = toOrigin(value);
  return (
    origin === "https://aitcommunity.org" ||
    origin === "https://www.aitcommunity.org"
  );
}

function isVercelPreviewHost(hostname: string) {
  return hostname.endsWith(".vercel.app");
}

export function resolveBetterAuthBaseUrl(env: AuthUrlEnv) {
  const betterAuthUrl = trimValue(env.BETTER_AUTH_URL);
  const betterAuthBaseUrl = trimValue(env.BETTER_AUTH_BASE_URL);
  const publicAppUrl = trimValue(env.NEXT_PUBLIC_APP_URL);
  const port = trimValue(env.PORT);

  if (env.NODE_ENV === "development" && port) {
    return `http://localhost:${port}`;
  }

  const candidates = [betterAuthUrl, betterAuthBaseUrl, publicAppUrl].filter(
    (value): value is string => Boolean(value),
  );

  // Production deploys must never mint verify / OAuth URLs on a preview host
  // or the apex. #246 allowed an explicit apex BETTER_AUTH_URL; verify then
  // ran on www (canonical email) and ctx.redirect landed Hub on apex.
  if (env.VERCEL_ENV === "production") {
    return CANONICAL_PRODUCTION_ORIGIN;
  }

  return candidates[0] ?? "http://localhost:3000";
}

export function resolveTrustedOrigins(env: AuthUrlEnv, request?: Request) {
  const origins = new Set<string>();

  const add = (value?: string) => {
    const origin = toOrigin(value);
    if (origin) origins.add(origin);
  };

  add(resolveBetterAuthBaseUrl(env));
  add(env.NEXT_PUBLIC_APP_URL);
  add(env.VERCEL_URL);
  add(env.VERCEL_BRANCH_URL);

  for (const part of (env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(/[\s,]+/)) {
    add(part);
  }

  if (env.NODE_ENV === "production") {
    for (const origin of PRODUCTION_APP_ORIGINS) add(origin);
  }

  // In development, also trust requests from the local dev server
  if (env.NODE_ENV === "development") {
    const host = request?.headers.get("host")?.trim();
    const proto = request?.headers.get("x-forwarded-proto")?.trim() ?? "http";

    if (host) add(`${proto}://${host}`);
  }

  return [...origins];
}

/**
 * Host-only cookies on preview/dev. Shared Domain only on Vercel production
 * (or a non-Vercel host whose resolved auth origin is www/apex) so a preview
 * that inherits NEXT_PUBLIC_APP_URL=https://www.aitcommunity.org does not
 * emit Domain=aitcommunity.org from a *.vercel.app response — browsers drop
 * that cookie and sign-in looks signed-out.
 */
export function resolveSessionCookieDomain(env: AuthUrlEnv) {
  if (env.VERCEL_ENV !== undefined && env.VERCEL_ENV !== "production") {
    return undefined;
  }
  if (!isProductionAppOrigin(resolveBetterAuthBaseUrl(env))) return undefined;
  return PRODUCTION_COOKIE_DOMAIN;
}

/**
 * Keep verify / OAuth callbacks on-site. Preview hosts may carry a Hub path;
 * unknown hosts fall back to Hub instead of becoming an open redirect.
 */
export function sanitizeVerifyCallbackUrl(
  callback: string,
  fallback = HUB_COMMUNITY_PATH,
) {
  if (!callback) return fallback;
  if (callback.startsWith("/") && !callback.startsWith("//")) {
    return sanitizeRedirect(callback, fallback);
  }
  try {
    const url = new URL(callback);
    const allowed =
      isProductionAppOrigin(url.origin) || isVercelPreviewHost(url.hostname);
    if (!allowed) return fallback;
    return sanitizeRedirect(`${url.pathname}${url.search}`, fallback);
  } catch {
    return fallback;
  }
}

/**
 * On Vercel production, rewrite a preview-minted verify link onto www so the
 * session cookie is set on the real app, not a preview host.
 */
export function canonicalizeVerificationUrl(url: string, env: AuthUrlEnv) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (
    env.VERCEL_ENV === "production" &&
    parsed.origin !== CANONICAL_PRODUCTION_ORIGIN
  ) {
    parsed = new URL(
      `${parsed.pathname}${parsed.search}`,
      CANONICAL_PRODUCTION_ORIGIN,
    );
  }

  const callback = parsed.searchParams.get("callbackURL");
  if (callback) {
    parsed.searchParams.set("callbackURL", sanitizeVerifyCallbackUrl(callback));
  }
  return parsed.toString();
}

/**
 * Verify 302 Location. A relative `/communities/ait` should stay on the
 * verify host, but production (Better Auth baseURL / Vercel primary domain)
 * has been sending Hub to apex. Always emit an absolute www URL when the
 * request is already on www/apex so the Set-Cookie host matches Hub.
 * Preview stays relative.
 */
export function pinVerifyRedirectLocation(
  location: string | null | undefined,
  requestUrl?: string,
) {
  const path = sanitizeVerifyCallbackUrl(location ?? "");
  if (isApexUrl(location) || isProductionAppOrigin(requestUrl)) {
    return `${CANONICAL_PRODUCTION_ORIGIN}${path}`;
  }
  return path;
}

/** Document-request safety net: leftover apex Hub hops back to www. */
export function getApexToWwwRedirectUrl(requestUrl: string) {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.hostname !== "aitcommunity.org") return null;
  url.hostname = "www.aitcommunity.org";
  url.protocol = "https:";
  return url.toString();
}

function isApexUrl(value?: string | null) {
  if (!value?.startsWith("http")) return false;
  try {
    return new URL(value).hostname === "aitcommunity.org";
  } catch {
    return false;
  }
}
