type AuthUrlEnv = {
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_BASE_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
  PORT?: string;
};

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

  return betterAuthUrl ?? betterAuthBaseUrl ?? publicAppUrl ?? "http://localhost:3000";
}

export function resolveTrustedOrigins(env: AuthUrlEnv, request?: Request) {
  const origins = new Set<string>();

  origins.add(resolveBetterAuthBaseUrl(env));

  const publicAppUrl = trimValue(env.NEXT_PUBLIC_APP_URL);
  if (publicAppUrl) origins.add(publicAppUrl);

  // In development, also trust requests from the local dev server
  if (env.NODE_ENV === "development") {
    const host = request?.headers.get("host")?.trim();
    const proto = request?.headers.get("x-forwarded-proto")?.trim() ?? "http";

    if (host) origins.add(`${proto}://${host}`);
  }

  return [...origins];
}
