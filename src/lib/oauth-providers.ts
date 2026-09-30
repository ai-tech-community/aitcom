/**
 * Registry of the OAuth providers members can sign in with.
 *
 * Every place that lists sign-in providers (Better Auth config, auth pages,
 * Settings, disconnect) reads this registry, so adding a provider is one
 * entry here plus its presentation in `oauth-provider-icon.tsx`.
 *
 * Sign-in is not the same as a verified public identity: GitHub and LinkedIn
 * also bind a verified handle (`SOCIAL_PROVIDERS` in `social-identity.ts`);
 * Google is sign-in only and never shows on a profile.
 *
 * GitHub keys are required by the env schema (`src/env.js`), so GitHub is
 * always enabled in a running app; Google and LinkedIn are optional.
 *
 * A provider is enabled when both of its env vars are set. They are read via
 * `process.env[name]` (computed key) at request time so Next.js / webpack
 * cannot inline a build-time `undefined` the way `process.env.X` and t3
 * `runtimeEnv` snapshots can — a Vercel runtime secret enables the button
 * without a rebuild.
 */

/** Display order on the auth pages and in Settings. */
export const OAUTH_PROVIDERS = ["google", "github", "linkedin"] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export type OAuthCredentials = { clientId: string; clientSecret: string };

const CREDENTIAL_ENV: Record<
  OAuthProvider,
  { clientId: string; clientSecret: string }
> = {
  google: {
    clientId: "BETTER_AUTH_GOOGLE_CLIENT_ID",
    clientSecret: "BETTER_AUTH_GOOGLE_CLIENT_SECRET",
  },
  github: {
    clientId: "BETTER_AUTH_GITHUB_CLIENT_ID",
    clientSecret: "BETTER_AUTH_GITHUB_CLIENT_SECRET",
  },
  linkedin: {
    clientId: "BETTER_AUTH_LINKEDIN_CLIENT_ID",
    clientSecret: "BETTER_AUTH_LINKEDIN_CLIENT_SECRET",
  },
};

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/** Build a record with one entry per provider, typed by provider id. */
export function mapOAuthProviders<T>(
  fn: (provider: OAuthProvider) => T,
): Record<OAuthProvider, T> {
  return Object.fromEntries(
    OAUTH_PROVIDERS.map((provider) => [provider, fn(provider)]),
  ) as Record<OAuthProvider, T>;
}

export function readProcessEnvValue(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readOAuthCredentials(
  provider: OAuthProvider,
): OAuthCredentials | null {
  const names = CREDENTIAL_ENV[provider];
  const clientId = readProcessEnvValue(names.clientId);
  const clientSecret = readProcessEnvValue(names.clientSecret);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isOAuthProviderEnabled(provider: OAuthProvider): boolean {
  return readOAuthCredentials(provider) !== null;
}

export function enabledOAuthProviders(): Record<OAuthProvider, boolean> {
  return mapOAuthProviders(isOAuthProviderEnabled);
}

/**
 * A provider may be disconnected only when another working sign-in method
 * remains: a password, or another linked provider that is still enabled.
 * A linked provider whose keys were removed cannot sign anyone in.
 */
export function canDisconnectProvider(
  provider: OAuthProvider | "credential",
  accounts: { providerId: string }[],
  enabled: Record<OAuthProvider, boolean>,
): { ok: true } | { ok: false; reason: "last_sign_in" } {
  const remainingSignIn = accounts.filter(
    (account) =>
      account.providerId !== provider &&
      (account.providerId === "credential" ||
        (isOAuthProvider(account.providerId) && enabled[account.providerId])),
  );

  if (remainingSignIn.length === 0) {
    return { ok: false, reason: "last_sign_in" };
  }
  return { ok: true };
}
