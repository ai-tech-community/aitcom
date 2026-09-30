/**
 * DB-INTEGRATION test for the pre-account-takeover guard.
 *
 * Drives Better Auth's own `internalAdapter.linkAccount` — the call its OAuth
 * callback makes when a sign-in joins an existing account by email — so the
 * databaseHooks wiring in config.ts is exercised, not just the helper.
 *
 * AUTO-SKIPS unless RUN_DB_TESTS=1 and a local-looking DATABASE_URL is set.
 * See work-grid.integration.test.ts for the gate rationale.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     pnpm exec vitest run src/server/better-auth/release-unproven-password.integration.test.ts
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

describe.skipIf(!RUN_DB)("releaseUnprovenPassword [DB integration]", () => {
  let db: typeof import("@/server/db").db;
  let schema: typeof import("@/server/db/schema");
  let auth: typeof import("@/server/better-auth").auth;

  const userIds: string[] = [];

  beforeAll(async () => {
    // The guard only runs when email verification is required, which the
    // config derives from RESEND_API_KEY at import time.
    process.env.RESEND_API_KEY ??= "re_test_guard";
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
    if (!userIds.length) return;
    await db
      .delete(schema.session)
      .where(inArray(schema.session.userId, userIds));
    await db
      .delete(schema.account)
      .where(inArray(schema.account.userId, userIds));
    await db.delete(schema.user).where(inArray(schema.user.id, userIds));
    userIds.length = 0;
  });

  async function seedPasswordUser(emailVerified: boolean) {
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const id = `guard-${sfx}`;
    userIds.push(id);
    await db.insert(schema.user).values({
      id,
      email: `${id}@example.test`,
      name: "Guard Test",
      emailVerified,
    });
    await db.insert(schema.account).values({
      userId: id,
      accountId: id,
      providerId: "credential",
      password: "attacker-chosen-hash",
    });
    await db.insert(schema.session).values({
      userId: id,
      token: `tok-${sfx}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    return id;
  }

  async function linkGoogle(userId: string) {
    const ctx = await auth.$context;
    return ctx.internalAdapter.linkAccount({
      userId,
      providerId: "google",
      accountId: `google-${userId}`,
    });
  }

  async function providersOf(userId: string) {
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({ providerId: schema.account.providerId })
      .from(schema.account)
      .where(eq(schema.account.userId, userId));
    return rows.map((r) => r.providerId).sort();
  }

  async function sessionCount(userId: string) {
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({ id: schema.session.id })
      .from(schema.session)
      .where(eq(schema.session.userId, userId));
    return rows.length;
  }

  it("drops the password and sessions of an unverified account on join", async () => {
    const id = await seedPasswordUser(false);

    await linkGoogle(id);

    expect(await providersOf(id)).toEqual(["google"]);
    expect(await sessionCount(id)).toBe(0);
  });

  it("leaves a verified account's password and sessions alone", async () => {
    const id = await seedPasswordUser(true);

    await linkGoogle(id);

    expect(await providersOf(id)).toEqual(["credential", "google"]);
    expect(await sessionCount(id)).toBe(1);
  });
});
