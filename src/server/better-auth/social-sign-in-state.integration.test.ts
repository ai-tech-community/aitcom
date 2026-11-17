/**
 * DB-INTEGRATION test: starting a social sign-in stores its state.
 *
 * Better Auth writes the OAuth state (PKCE verifier + callback and error
 * URLs) into `app.verification.value` before redirecting to the provider.
 * When that column was varchar(255), a sign-up page carrying a query string
 * (an invite, a return path) overflowed it and Google sign-in failed with
 * "value too long for type character varying(255)".
 *
 * AUTO-SKIPS unless RUN_DB_TESTS=1 and a local-looking DATABASE_URL is set.
 * See work-grid.integration.test.ts for the gate rationale.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     pnpm exec vitest run src/server/better-auth/social-sign-in-state.integration.test.ts
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}

function looksLikeLocalDb(url: string): boolean {
  if (!url) return false;
  if (looksLikeCloudNeon(url)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    url,
  );
}

function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const proxy = process.env.NEON_LOCAL_PROXY?.trim();
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  if (proxy) return true;
  return looksLikeLocalDb(dbUrl);
}

const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("social sign-in state [DB integration]", () => {
  let db: typeof import("@/server/db").db;
  let schema: typeof import("@/server/db/schema");
  let auth: typeof import("@/server/better-auth").auth;

  const identifiers: string[] = [];

  beforeAll(async () => {
    // Google is only registered when its credentials exist at import time.
    process.env.BETTER_AUTH_GOOGLE_CLIENT_ID ??= "test-google-client-id";
    process.env.BETTER_AUTH_GOOGLE_CLIENT_SECRET ??= "test-google-secret";
    const [dbMod, schemaMod, authMod] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/better-auth"),
    ]);
    db = dbMod.db;
    schema = schemaMod;
    auth = authMod.auth;
  });

  afterEach(async () => {
    const { inArray } = await import("drizzle-orm");
    if (!identifiers.length) return;
    await db
      .delete(schema.verification)
      .where(inArray(schema.verification.identifier, identifiers));
    identifiers.length = 0;
  });

  it("starts Google sign-up from a page with a return path in its query", async () => {
    const callbackURL = "/he/communities/ait-community-tel-aviv";
    const errorCallbackURL = `/he/auth/signup?callbackUrl=${encodeURIComponent(
      "/he/communities/ait-community-tel-aviv/join?ref=whatsapp-group",
    )}`;

    // The route the sign-up page's "Continue with Google" button posts to.
    const origin = new URL(auth.options.baseURL).origin;
    const response = await auth.handler(
      new Request(`${origin}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({
          provider: "google",
          callbackURL,
          errorCallbackURL,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      url: string;
      redirect: boolean;
    };
    expect(result.redirect).toBe(true);
    const state = new URL(result.url).searchParams.get("state");
    expect(state).toBeTruthy();
    identifiers.push(state!);

    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({ value: schema.verification.value })
      .from(schema.verification)
      .where(eq(schema.verification.identifier, state!));
    expect(row!.value.length).toBeGreaterThan(255);
    const stored = JSON.parse(row!.value) as {
      callbackURL: string;
      errorURL: string;
    };
    expect(stored.callbackURL).toBe(callbackURL);
    expect(stored.errorURL).toBe(errorCallbackURL);
  });
});
