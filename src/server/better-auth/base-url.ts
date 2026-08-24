type AuthUrlEnv = {
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_BASE_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
  PORT?: string;
  VERCEL_URL?: string;
  VERCEL_BRANCH_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
};

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

export function resolveBetterAuthBaseUrl(env: AuthUrlEnv) {
  const betterAuthUrl = trimValue(env.BETTER_AUTH_URL);
  const betterAuthBaseUrl = trimValue(env.BETTER_AUTH_BASE_URL);
  const publicAppUrl = trimValue(env.NEXT_PUBLIC_APP_URL);
  const port = trimValue(env.PORT);

  if (env.NODE_ENV === "development" && port) {
    return `http://localhost:${port}`;
  }

  return (
    betterAuthUrl ??
    betterAuthBaseUrl ??
    publicAppUrl ??
    "http://localhost:3000"
  );
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
