/**
 * LinkedIn OAuth is optional and often added after the first production build.
 * Read via `process.env[name]` (computed key) so Next.js / webpack cannot
 * inline a build-time `undefined` the way `process.env.BETTER_AUTH_LINKEDIN_*`
 * and t3 `runtimeEnv` snapshots can.
 *
 * Names must stay exactly:
 *   BETTER_AUTH_LINKEDIN_CLIENT_ID
 *   BETTER_AUTH_LINKEDIN_CLIENT_SECRET
 */
const LINKEDIN_CLIENT_ID = "BETTER_AUTH_LINKEDIN_CLIENT_ID";
const LINKEDIN_CLIENT_SECRET = "BETTER_AUTH_LINKEDIN_CLIENT_SECRET";

export function readProcessEnvValue(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readLinkedinOAuthCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = readProcessEnvValue(LINKEDIN_CLIENT_ID);
  const clientSecret = readProcessEnvValue(LINKEDIN_CLIENT_SECRET);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isLinkedinOAuthEnabled(): boolean {
  return readLinkedinOAuthCredentials() !== null;
}
