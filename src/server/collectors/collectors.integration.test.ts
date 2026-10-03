// @vitest-environment node
// All collector DB tests that claim or count runs live in this one file:
// vitest runs a file's tests in order, so no other file can claim our runs.
import type * as DrizzleOrm from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { db as AppDb } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type * as Quota from "./quota";

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

describe.skipIf(!isLocalDbConfigured())("collectors [DB integration]", () => {
  type Mods = {
    db: typeof AppDb;
    schema: typeof Schema;
    drizzle: typeof DrizzleOrm;
    quota: typeof Quota;
  };
  let m: Mods;
  const userIds: string[] = [];

  async function makeUser(): Promise<string> {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const id = `it-collector-${suffix}`;
    await m.db.insert(m.schema.user).values({
      id,
      email: `${id}@example.test`,
      name: "IT Collector",
    });
    userIds.push(id);
    return id;
  }

  async function insertRun(
    userId: string,
    over: Partial<typeof Schema.collectorRuns.$inferInsert> = {},
  ): Promise<string> {
    const [row] = await m.db
      .insert(m.schema.collectorRuns)
      .values({
        userId,
        origin: "web",
        collectorId: "test-collector",
        collectorVersion: 1,
        input: {},
        status: "queued",
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        ...over,
      })
      .returning({ id: m.schema.collectorRuns.id });
    return row!.id;
  }

  beforeAll(async () => {
    const [{ db }, schema, drizzle, quota] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("drizzle-orm"),
      import("./quota"),
    ]);
    m = { db, schema, drizzle, quota };
  }, 120_000);

  beforeEach(async () => {
    // Test DB only (gated above): start every test from no runs at all.
    await m.db.delete(m.schema.collectorRuns).where(m.drizzle.sql`true`);
  });

  afterAll(async () => {
    if (userIds.length) {
      await m.db
        .delete(m.schema.user)
        .where(m.drizzle.inArray(m.schema.user.id, userIds));
    }
  });

  describe("canStartRun", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    const roomy = { runsPerDay: 20, activePerUser: 2, activePlatform: 1_000 };

    it("allows a member with no runs", async () => {
      const userId = await makeUser();
      expect(await m.quota.canStartRun(m.db, userId, now, roomy)).toEqual({
        allowed: true,
      });
    });

    it("refuses the 21st run in 24 hours, counting only this member", async () => {
      const userId = await makeUser();
      const other = await makeUser();
      for (let i = 0; i < 20; i++) {
        await insertRun(userId, {
          status: "succeeded",
          createdAt: new Date(now.getTime() - (i + 1) * 60_000),
        });
      }
      await insertRun(other, { status: "succeeded", createdAt: now });
      const decision = await m.quota.canStartRun(m.db, userId, now, roomy);
      expect(decision).toMatchObject({ allowed: false, reason: "daily_limit" });
      expect(await m.quota.canStartRun(m.db, other, now, roomy)).toEqual({
        allowed: true,
      });
    });

    it("forgets runs older than 24 hours", async () => {
      const userId = await makeUser();
      for (let i = 0; i < 20; i++) {
        await insertRun(userId, {
          status: "succeeded",
          createdAt: new Date(now.getTime() - 25 * 3_600_000),
        });
      }
      expect(await m.quota.canStartRun(m.db, userId, now, roomy)).toEqual({
        allowed: true,
      });
    });

    it("refuses a third active run", async () => {
      const userId = await makeUser();
      await insertRun(userId, { status: "queued", createdAt: now });
      await insertRun(userId, { status: "running", createdAt: now });
      expect(await m.quota.canStartRun(m.db, userId, now, roomy)).toMatchObject(
        {
          allowed: false,
          reason: "active_limit",
        },
      );
    });

    it("refuses when the platform is at its active cap", async () => {
      const userId = await makeUser();
      expect(
        await m.quota.canStartRun(m.db, userId, now, {
          ...roomy,
          activePlatform: 0,
        }),
      ).toMatchObject({ allowed: false, reason: "platform_busy" });
    });
  });
});
