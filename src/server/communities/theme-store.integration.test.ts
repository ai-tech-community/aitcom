// @vitest-environment node
/**
 * DB-INTEGRATION test for the community look store (`app.community_theme`).
 * Proves, against a REAL local DB, that a look is written, overwritten (with
 * a fresh `updated_at`), and removed again by picking Plain; that deleting
 * the community removes its row through the foreign key; and that deleting
 * the user who chose it keeps the look and clears `updated_by`.
 *
 * Auto-skips unless RUN_DB_TESTS=1 and a local database is configured:
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/communities/theme-store.integration.test.ts
 */

import type { eq as drizzleEq, sql as drizzleSql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type * as ThemeStore from "@/server/communities/theme-store";
import type { db as appDb } from "@/server/db";
import type * as Schema from "@/server/db/schema";

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

describe.skipIf(!RUN_DB)("community theme store [DB integration]", () => {
  type Mods = {
    db: typeof appDb;
    schema: typeof Schema;
    eq: typeof drizzleEq;
    sql: typeof drizzleSql;
    store: typeof ThemeStore;
  };
  let m: Mods;
  let userId: string;
  let editorId: string | undefined;
  let communityId: string | undefined;

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [{ db }, schema, drizzle, store] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("drizzle-orm"),
      import("@/server/communities/theme-store"),
    ]);
    m = { db, schema, eq: drizzle.eq, sql: drizzle.sql, store };
  });

  beforeEach(async () => {
    const { db, schema } = m;
    // Reset first: if an insert below fails, afterEach must not delete the
    // previous test's rows (or a stranger's) by a stale id.
    communityId = undefined;
    editorId = undefined;
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    userId = `it-theme-owner-${suffix}`;
    await db
      .insert(schema.user)
      .values({ id: userId, email: `${userId}@example.test`, name: userId });
    const [row] = await db
      .insert(schema.communities)
      .values({
        name: `Theme ${suffix}`,
        slug: `it-theme-${suffix}`,
        createdBy: userId,
      })
      .returning({ id: schema.communities.id });
    communityId = row!.id;
  });

  afterEach(async () => {
    const { db, schema, eq } = m;
    if (communityId) {
      await db
        .delete(schema.communities)
        .where(eq(schema.communities.id, communityId));
    }
    if (editorId) {
      await db.delete(schema.user).where(eq(schema.user.id, editorId));
    }
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  function community(): string {
    if (!communityId) throw new Error("beforeEach made no community");
    return communityId;
  }

  async function storedRows() {
    const { db, schema, eq } = m;
    return db
      .select()
      .from(schema.communityThemes)
      .where(eq(schema.communityThemes.communityId, community()));
  }

  it("writes, overwrites and clears a look", async () => {
    const { db, schema, eq, sql, store } = m;
    const id = community();
    await expect(store.readCommunityThemeId(db, id)).resolves.toBe("plain");

    await store.writeCommunityThemeId(db, id, "canal", userId);
    await expect(store.readCommunityThemeId(db, id)).resolves.toBe("canal");

    // Back-date the first write, so the overwrite's now() is surely later.
    await db
      .update(schema.communityThemes)
      .set({ updatedAt: sql`now() - interval '1 hour'` })
      .where(eq(schema.communityThemes.communityId, id));
    const [before] = await storedRows();

    await store.writeCommunityThemeId(db, id, "night", userId);
    await expect(store.readCommunityThemeId(db, id)).resolves.toBe("night");
    const rows = await storedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ themeId: "night", updatedBy: userId });
    expect(rows[0]!.updatedAt.getTime()).toBeGreaterThan(
      before!.updatedAt.getTime(),
    );

    await store.writeCommunityThemeId(db, id, "plain", userId);
    await expect(storedRows()).resolves.toEqual([]);
    await expect(store.readCommunityThemeId(db, id)).resolves.toBe("plain");
  });

  it("drops the row when the community is deleted", async () => {
    const { db, schema, eq, store } = m;
    const id = community();
    await store.writeCommunityThemeId(db, id, "meadow", userId);
    await expect(storedRows()).resolves.toHaveLength(1);

    await db.delete(schema.communities).where(eq(schema.communities.id, id));

    await expect(storedRows()).resolves.toEqual([]);
  });

  it("keeps the look and forgets who chose it when that user is deleted", async () => {
    const { db, schema, eq, store } = m;
    const id = community();
    // An admin other than the creator, so deleting them leaves the
    // community in place.
    editorId = `${userId}-editor`;
    await db
      .insert(schema.user)
      .values({
        id: editorId,
        email: `${editorId}@example.test`,
        name: editorId,
      });
    await store.writeCommunityThemeId(db, id, "sunset", editorId);
    await expect(storedRows()).resolves.toMatchObject([
      { themeId: "sunset", updatedBy: editorId },
    ]);

    await db.delete(schema.user).where(eq(schema.user.id, editorId));
    editorId = undefined;

    await expect(storedRows()).resolves.toMatchObject([
      { themeId: "sunset", updatedBy: null },
    ]);
    await expect(store.readCommunityThemeId(db, id)).resolves.toBe("sunset");
  });
});
