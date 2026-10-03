// @vitest-environment node
// All collector DB tests that claim or count runs live in this one file:
// vitest runs a file's tests in order, so no other file can claim our runs.
import type * as DrizzleOrm from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { z } from "zod";

import type { db as AppDb } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { AnyCollector, CollectorContext } from "./collector";
import type * as Errors from "./errors";
import type * as Executor from "./executor";
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
    executor: typeof Executor;
    errors: typeof Errors;
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
    const [{ db }, schema, drizzle, quota, executor, errors] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("drizzle-orm"),
        import("./quota"),
        import("./executor"),
        import("./errors"),
      ]);
    m = { db, schema, drizzle, quota, executor, errors };
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

    it("does not count finished runs toward the active limit", async () => {
      const userId = await makeUser();
      await insertRun(userId, { status: "queued", createdAt: now });
      await insertRun(userId, { status: "succeeded", createdAt: now });
      await insertRun(userId, { status: "failed", createdAt: now });
      expect(await m.quota.canStartRun(m.db, userId, now, roomy)).toEqual({
        allowed: true,
      });
    });

    it("does not count another member's active runs toward this member's active limit", async () => {
      const userId = await makeUser();
      const other = await makeUser();
      await insertRun(userId, { status: "running", createdAt: now });
      await insertRun(other, { status: "queued", createdAt: now });
      await insertRun(other, { status: "running", createdAt: now });
      expect(await m.quota.canStartRun(m.db, userId, now, roomy)).toEqual({
        allowed: true,
      });
    });

    it("refuses when the platform is at its active cap, counting only active runs", async () => {
      const a = await makeUser();
      const b = await makeUser();
      const c = await makeUser();
      // Three active runs across other members, plus finished runs that must not count.
      await insertRun(a, { status: "queued", createdAt: now });
      await insertRun(b, { status: "running", createdAt: now });
      await insertRun(c, { status: "queued", createdAt: now });
      await insertRun(a, { status: "succeeded", createdAt: now });
      await insertRun(b, { status: "failed", createdAt: now });
      await insertRun(c, { status: "succeeded", createdAt: now });
      const active = 3;
      const fresh = await makeUser();
      expect(
        await m.quota.canStartRun(m.db, fresh, now, {
          ...roomy,
          activePlatform: active,
        }),
      ).toMatchObject({ allowed: false, reason: "platform_busy" });
      expect(
        await m.quota.canStartRun(m.db, fresh, now, {
          ...roomy,
          activePlatform: active + 1,
        }),
      ).toEqual({ allowed: true });
    });
  });

  describe("executor", () => {
    type Row = { n: number; title?: unknown };

    function testCollector(
      rows: (ctx: CollectorContext) => AsyncIterable<Row>,
      limits = { maxPages: 5, maxItems: 100, maxDurationMs: 60_000 },
    ): AnyCollector {
      return {
        id: "test-collector",
        version: 3,
        author: "platform",
        kind: "api",
        title: { en: "Test", nl: "Test" },
        description: { en: "Test", nl: "Test" },
        inputSchema: z.object({}),
        itemSchema: z.object({ n: z.number() }),
        fieldHints: {},
        sampleItem: { n: 1 },
        limits,
        run: (_input, ctx) => rows(ctx),
      };
    }

    function deps(collector: AnyCollector | undefined) {
      const meter = { pagesFetched: 4, bytesFetched: 1234 };
      return {
        db: m.db,
        getCollector: (id: string) =>
          collector?.id === id ? collector : undefined,
        buildContext: async ({
          signal,
          onLog,
        }: {
          signal: AbortSignal;
          onLog: (l: string) => void;
        }) => ({
          ctx: {
            signal,
            log: onLog,
            fetch: async () => {
              throw new Error("no network in tests");
            },
          },
          meter,
        }),
        now: Date.now,
      };
    }

    async function runRow(id: string) {
      const [row] = await m.db
        .select()
        .from(m.schema.collectorRuns)
        .where(m.drizzle.eq(m.schema.collectorRuns.id, id));
      return row!;
    }

    async function items(id: string) {
      return m.db
        .select()
        .from(m.schema.collectorItems)
        .where(m.drizzle.eq(m.schema.collectorItems.runId, id))
        .orderBy(m.schema.collectorItems.seq);
    }

    it("claims the oldest queued run and leases it", async () => {
      const userId = await makeUser();
      const older = await insertRun(userId, {
        createdAt: new Date(Date.now() - 60_000),
      });
      await insertRun(userId);
      const now = new Date();
      const claimed = await m.executor.claimNextRun(m.db, now);
      expect(claimed?.id).toBe(older);
      expect(claimed?.status).toBe("running");
      expect(claimed?.attempts).toBe(1);
      expect(claimed?.leaseUntil?.getTime()).toBe(
        now.getTime() + m.executor.LEASE_MS,
      );
    });

    it("never hands the same run to two concurrent workers", async () => {
      const userId = await makeUser();
      await insertRun(userId);
      await insertRun(userId);
      const now = new Date();
      const [a, b] = await Promise.all([
        m.executor.claimNextRun(m.db, now),
        m.executor.claimNextRun(m.db, now),
      ]);
      expect(a && b).toBeTruthy();
      expect(a!.id).not.toBe(b!.id);
    });

    it("re-claims a run whose lease expired, but not a live one", async () => {
      const userId = await makeUser();
      const now = new Date();
      await insertRun(userId, {
        status: "running",
        attempts: 1,
        leaseUntil: new Date(now.getTime() + 60_000),
      });
      const lost = await insertRun(userId, {
        status: "running",
        attempts: 1,
        leaseUntil: new Date(now.getTime() - 1),
      });
      const claimed = await m.executor.claimNextRun(m.db, now);
      expect(claimed?.id).toBe(lost);
      expect(claimed?.attempts).toBe(2);
      expect(await m.executor.claimNextRun(m.db, now)).toBeNull();
    });

    it("stores valid rows in order, counts invalid ones, and finishes", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* (ctx) {
        ctx.log("starting");
        yield { n: 1 };
        yield { n: "not a number" } as unknown as Row;
        yield { n: 2 };
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      const result = await m.executor.executeRun(
        deps(collector),
        run!,
        Date.now() + 60_000,
      );
      expect(result).toEqual({ status: "succeeded", stopReason: "complete" });
      expect((await items(id)).map((i) => [i.seq, i.data])).toEqual([
        [0, { n: 1 }],
        [1, { n: 2 }],
      ]);
      const row = await runRow(id);
      expect(row).toMatchObject({
        status: "succeeded",
        stopReason: "complete",
        itemCount: 2,
        invalidItemCount: 1,
        pagesFetched: 4,
        bytesFetched: 1234,
        log: ["starting"],
        error: null,
        leaseUntil: null,
      });
      expect(row.finishedAt).not.toBeNull();
      expect(row.durationMs).not.toBeNull();
    });

    it("flushes in batches and stops at the item limit", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(
        async function* () {
          for (let n = 0; n < 1_000; n++) yield { n };
        },
        { maxPages: 1, maxItems: 250, maxDurationMs: 60_000 },
      );
      const run = await m.executor.claimNextRun(m.db, new Date());
      const result = await m.executor.executeRun(
        deps(collector),
        run!,
        Date.now() + 60_000,
      );
      expect(result.stopReason).toBe("item_limit");
      expect(await items(id)).toHaveLength(250);
      expect((await runRow(id)).itemCount).toBe(250);
    });

    it("keeps rows collected before a site refused, and records the reason", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* () {
        yield { n: 1 };
        throw new m.errors.CollectorStop(
          "robots_disallowed",
          "failed",
          "Not allowed here.",
        );
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      await m.executor.executeRun(deps(collector), run!, Date.now() + 60_000);
      expect(await runRow(id)).toMatchObject({
        status: "failed",
        stopReason: "robots_disallowed",
        error: "Not allowed here.",
        itemCount: 1,
      });
    });

    it("hides an unexpected error's text from the member", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* () {
        throw new Error("password=hunter2 at db.internal");
      });
      const serverLog = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const run = await m.executor.claimNextRun(m.db, new Date());
      try {
        await m.executor.executeRun(deps(collector), run!, Date.now() + 60_000);
        // The raw text goes to the server log only.
        expect(serverLog).toHaveBeenCalledWith(
          `[collectors] run ${id} failed`,
          expect.objectContaining({
            message: "password=hunter2 at db.internal",
          }),
        );
      } finally {
        serverLog.mockRestore();
      }
      const row = await runRow(id);
      expect(row).toMatchObject({ status: "failed", stopReason: "error" });
      expect(row.error).toBe(
        "Something went wrong while collecting. Try again later.",
      );
    });

    it("ends as time_limit when the tick deadline passes mid-run", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* () {
        for (let n = 0; n < 100; n++) {
          await new Promise((r) => setTimeout(r, 20));
          yield { n };
        }
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      const result = await m.executor.executeRun(
        deps(collector),
        run!,
        Date.now() + 100,
      );
      expect(result).toEqual({ status: "succeeded", stopReason: "time_limit" });
      const stored = (await runRow(id)).itemCount;
      expect(stored).toBeGreaterThan(0);
      expect(stored).toBeLessThan(100);
    });

    it("wipes an earlier attempt's rows and counters before re-running", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId, {
        status: "running",
        attempts: 1,
        leaseUntil: new Date(Date.now() - 1),
        itemCount: 2,
        invalidItemCount: 5,
      });
      await m.db.insert(m.schema.collectorItems).values([
        { runId: id, seq: 0, data: { n: 99 } },
        { runId: id, seq: 1, data: { n: 98 } },
      ]);
      const collector = testCollector(async function* () {
        yield { n: 1 };
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      await m.executor.executeRun(deps(collector), run!, Date.now() + 60_000);
      expect((await items(id)).map((i) => i.data)).toEqual([{ n: 1 }]);
      expect(await runRow(id)).toMatchObject({
        itemCount: 1,
        invalidItemCount: 0,
      });
    });

    it("gives up as worker_lost on the third claim", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId, {
        status: "running",
        attempts: 2,
        leaseUntil: new Date(Date.now() - 1),
        itemCount: 2,
        invalidItemCount: 1,
        pagesFetched: 3,
        bytesFetched: 4_096,
        log: ["page 1", "page 2"],
      });
      await m.db.insert(m.schema.collectorItems).values([
        { runId: id, seq: 0, data: { n: 99 } },
        { runId: id, seq: 1, data: { n: 98 } },
      ]);
      const collector = testCollector(async function* () {
        yield { n: 1 };
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      const result = await m.executor.executeRun(
        deps(collector),
        run!,
        Date.now() + 60_000,
      );
      expect(result).toEqual({ status: "failed", stopReason: "worker_lost" });
      expect(await items(id)).toHaveLength(0);
      expect(await runRow(id)).toMatchObject({
        status: "failed",
        itemCount: 0,
        invalidItemCount: 0,
        pagesFetched: 0,
        bytesFetched: 0,
        log: ["page 1", "page 2"],
      });
    });

    it("turns a worker's writes into no-ops once another worker re-claimed its run", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* () {
        for (let n = 0; n < 150; n++) yield { n };
      });
      const stale = await m.executor.claimNextRun(m.db, new Date());
      // Another worker re-claims the run after this worker's lease expired.
      await m.db
        .update(m.schema.collectorRuns)
        .set({ attempts: 2, leaseUntil: new Date(Date.now() + 60_000) })
        .where(m.drizzle.eq(m.schema.collectorRuns.id, id));
      await m.executor.executeRun(deps(collector), stale!, Date.now() + 60_000);
      expect(await items(id)).toHaveLength(0);
      expect(await runRow(id)).toMatchObject({
        status: "running",
        attempts: 2,
        itemCount: 0,
        stopReason: null,
        finishedAt: null,
      });
    });

    it("fails a run whose collector is gone or switched off", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const run = await m.executor.claimNextRun(m.db, new Date());
      await m.executor.executeRun(deps(undefined), run!, Date.now() + 60_000);
      expect(await runRow(id)).toMatchObject({
        status: "failed",
        stopReason: "error",
        error: "This collector is not available any more.",
      });
    });

    it("records the collector version that actually ran", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId, { collectorVersion: 1 });
      const collector = testCollector(async function* () {
        yield { n: 1 };
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      await m.executor.executeRun(deps(collector), run!, Date.now() + 60_000);
      expect((await runRow(id)).collectorVersion).toBe(3);
    });

    it("a worker tick drains the queue", async () => {
      const userId = await makeUser();
      await insertRun(userId);
      await insertRun(userId);
      const collector = testCollector(async function* () {
        yield { n: 1 };
      });
      expect(await m.executor.runWorkerTick(deps(collector))).toEqual({
        executed: 2,
      });
      expect(await m.executor.claimNextRun(m.db, new Date())).toBeNull();
    });

    it("a worker tick moves on when one run cannot be executed", async () => {
      const userId = await makeUser();
      const first = await insertRun(userId, {
        createdAt: new Date(Date.now() - 60_000),
      });
      const second = await insertRun(userId);
      const collector = testCollector(async function* () {
        yield { n: 1 };
      });
      let calls = 0;
      const flaky = {
        ...deps(collector),
        getCollector: (cid: string) => {
          calls += 1;
          if (calls === 1) throw new Error("connection terminated");
          return cid === collector.id ? collector : undefined;
        },
      };
      const serverLog = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        expect(await m.executor.runWorkerTick(flaky)).toEqual({ executed: 1 });
        expect(serverLog).toHaveBeenCalledWith(
          `[collectors] run ${first} could not be executed`,
          expect.objectContaining({ message: "connection terminated" }),
        );
      } finally {
        serverLog.mockRestore();
      }
      // The failed run keeps its lease and is re-claimed after it expires.
      expect(await runRow(first)).toMatchObject({ status: "running" });
      expect((await runRow(first)).leaseUntil).not.toBeNull();
      expect(await runRow(second)).toMatchObject({ status: "succeeded" });
    });
  });
});
