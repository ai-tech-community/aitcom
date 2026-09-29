// @vitest-environment node
/**
 * DB-INTEGRATION for account names (ADR-0038, #369 slice 2), against a real
 * local database:
 *   - migration 20260929b applies, called like the deploy runner (`{ db }`);
 *   - ensureAccountNames refuses an account without names and saves given
 *     names;
 *   - Better Auth reads the names back into the session user, which is what
 *     the register button checks before asking.
 * Auto-skips unless RUN_DB_TESTS=1 and a local database is configured.
 */
import type { eq as Eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { auth as Auth } from "@/server/better-auth";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { ensureAccountNames as EnsureAccountNames } from "./registration-names";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("account names [DB integration]", () => {
  type Mods = {
    db: typeof Db;
    schema: typeof Schema;
    eq: typeof Eq;
    ensureAccountNames: typeof EnsureAccountNames;
    auth: typeof Auth;
  };
  let m: Mods;
  let userId: string;

  beforeAll(async () => {
    const [dbMod, schema, drizzle, names, migration, authMod] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("drizzle-orm"),
        import("./registration-names"),
        import("@/migrations/20260929b_account_names_and_organizer_notice"),
        import("@/server/better-auth"),
      ]);
    m = {
      db: dbMod.db,
      schema,
      eq: drizzle.eq,
      ensureAccountNames: names.ensureAccountNames,
      auth: authMod.auth,
    };
    await migration.up({ db: dbMod.db } as never);
  }, 120_000);

  afterEach(async () => {
    const { db, schema, eq } = m;
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  async function seedUser() {
    userId = `it-names-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await m.db
      .insert(m.schema.user)
      .values({ id: userId, email: `${userId}@example.test`, name: "Jan" });
  }

  it("refuses an account without names", async () => {
    await seedUser();
    await expect(m.ensureAccountNames(m.db, userId, {})).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "NAME_REQUIRED",
    });
  });

  it("saves given names, and Better Auth puts them on the session user", async () => {
    await seedUser();
    await m.ensureAccountNames(m.db, userId, {
      firstName: "Jan",
      lastName: "van der Berg",
    });
    // Asked once: the account now satisfies the check on its own.
    await expect(m.ensureAccountNames(m.db, userId, {})).resolves.toBe(
      undefined,
    );

    // The user row as Better Auth reads it (the same parse getSession uses
    // for the session user). findUserById runs no session hooks.
    const ctx = await m.auth.$context;
    const found = { user: await ctx.internalAdapter.findUserById(userId) };

    expect(found?.user).toMatchObject({
      id: userId,
      firstName: "Jan",
      lastName: "van der Berg",
    });
  });
});
