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

import { getCollector } from "./catalog";
import type { AnyCollector, CollectorContext } from "./collector";
import type * as Errors from "./errors";
import type * as Executor from "./executor";
import type * as Quota from "./quota";
import type * as Runs from "./runs";

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
    runs: typeof Runs;
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
    const [{ db }, schema, drizzle, quota, executor, errors, runs] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("drizzle-orm"),
        import("./quota"),
        import("./executor"),
        import("./errors"),
        import("./runs"),
      ]);
    m = { db, schema, drizzle, quota, executor, errors, runs };
    // These tests delete every collector run. Refuse any database but the
    // dedicated test one, whatever DATABASE_URL looks like.
    const { rows } = await m.db.execute<{ name: string }>(
      m.drizzle.sql`select current_database() as name`,
    );
    const name = rows[0]?.name;
    if (name !== "aitcom_test") {
      throw new Error(
        `Refusing to run collector DB tests against "${name}"; use aitcom_test.`,
      );
    }
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
      // The oldest of the 20 (20 minutes ago) leaves the window first.
      expect(decision).toEqual({
        allowed: false,
        reason: "daily_limit",
        message: "You can start 20 runs per 24 hours. Try again later.",
        retryAt: new Date(now.getTime() - 20 * 60_000 + 86_400_000),
      });
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
      const decision = await m.quota.canStartRun(m.db, userId, now, roomy);
      expect(decision).toMatchObject({
        allowed: false,
        reason: "active_limit",
      });
      expect(decision).not.toHaveProperty("retryAt");
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

    it("counts this member's runs in the rolling 24 hours", async () => {
      const userId = await makeUser();
      const other = await makeUser();
      await insertRun(userId, { createdAt: new Date(now.getTime() - 60_000) });
      await insertRun(userId, {
        createdAt: new Date(now.getTime() - 25 * 3_600_000),
      });
      await insertRun(other, { createdAt: now });
      expect(await m.quota.countRunsInWindow(m.db, userId, now)).toBe(1);
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

    function deps(
      collector: AnyCollector | undefined,
      dispose?: () => Promise<void>,
    ) {
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
            extractList: async () => {
              throw new Error("no extraction in tests");
            },
          },
          meter,
          dispose,
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
      expect(result?.stopReason).toBe("item_limit");
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
        errorDetail: { code: "robots_disallowed" },
        itemCount: 1,
      });
    });

    it("stores a stop's own failure detail for the member's screen", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* () {
        yield* [];
        throw new m.errors.CollectorStop(
          "error",
          "failed",
          "This address is not an RSS or Atom feed.",
          { code: "not_a_feed" },
        );
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      await m.executor.executeRun(deps(collector), run!, Date.now() + 60_000);
      expect(await runRow(id)).toMatchObject({
        status: "failed",
        stopReason: "error",
        error: "This address is not an RSS or Atom feed.",
        errorDetail: { code: "not_a_feed" },
      });
    });

    it("stores no failure detail for a partial stop", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* () {
        yield { n: 1 };
        throw new m.errors.CollectorStop(
          "page_limit",
          "succeeded",
          "Stopped at the page limit.",
        );
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      await m.executor.executeRun(deps(collector), run!, Date.now() + 60_000);
      expect(await runRow(id)).toMatchObject({
        status: "succeeded",
        stopReason: "page_limit",
        error: null,
        errorDetail: null,
      });
    });

    it("cuts a long stop message to the 500 characters the error column holds", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* () {
        yield { n: 1 };
        throw new m.errors.CollectorStop("error", "failed", "x".repeat(600));
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      const result = await m.executor.executeRun(
        deps(collector),
        run!,
        Date.now() + 60_000,
      );
      expect(result).toEqual({ status: "failed", stopReason: "error" });
      const row = await runRow(id);
      expect(row.status).toBe("failed");
      expect(row.error).toBe("x".repeat(500));
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
      expect(row.errorDetail).toEqual({ code: "generic" });
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

    it("wipes an earlier attempt's rows and item counters, keeping page and byte totals", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId, {
        status: "running",
        attempts: 1,
        leaseUntil: new Date(Date.now() - 1),
        itemCount: 2,
        invalidItemCount: 5,
        pagesFetched: 3,
        bytesFetched: 100,
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
      // Pages and bytes are cumulative across attempts: 3 + 4 and 100 + 1234.
      expect(await runRow(id)).toMatchObject({
        itemCount: 1,
        invalidItemCount: 0,
        pagesFetched: 7,
        bytesFetched: 1334,
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
        errorDetail: { code: "worker_lost" },
        itemCount: 0,
        invalidItemCount: 0,
        pagesFetched: 3,
        bytesFetched: 4_096,
        log: ["page 1", "page 2"],
      });
    });

    it("does not run the collector at all when another worker already re-claimed the run", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      let started = false;
      const collector = testCollector(async function* () {
        started = true;
        yield { n: 1 };
      });
      const built = vi.fn(deps(collector).buildContext);
      const stale = await m.executor.claimNextRun(m.db, new Date());
      // Another worker re-claims the run after this worker's lease expired.
      await m.db
        .update(m.schema.collectorRuns)
        .set({ attempts: 2, leaseUntil: new Date(Date.now() + 60_000) })
        .where(m.drizzle.eq(m.schema.collectorRuns.id, id));
      const result = await m.executor.executeRun(
        { ...deps(collector), buildContext: built },
        stale!,
        Date.now() + 60_000,
      );
      expect(result).toBeNull();
      expect(built).not.toHaveBeenCalled();
      expect(started).toBe(false);
      expect(await runRow(id)).toMatchObject({
        status: "running",
        attempts: 2,
        stopReason: null,
      });
    });

    it("turns a worker's writes into no-ops once another worker re-claimed its run mid-run", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* () {
        // Another worker re-claims the run after this worker's lease expired.
        await m.db
          .update(m.schema.collectorRuns)
          .set({ attempts: 2, leaseUntil: new Date(Date.now() + 60_000) })
          .where(m.drizzle.eq(m.schema.collectorRuns.id, id));
        for (let n = 0; n < 150; n++) yield { n };
      });
      const stale = await m.executor.claimNextRun(m.db, new Date());
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
        errorDetail: { code: "collector_unavailable" },
      });
    });

    it("fails a run whose saved input no longer fits the collector", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId, { input: "not an object" });
      const collector = testCollector(async function* () {
        yield { n: 1 };
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      await m.executor.executeRun(deps(collector), run!, Date.now() + 60_000);
      expect(await runRow(id)).toMatchObject({
        status: "failed",
        stopReason: "error",
        errorDetail: { code: "input_invalid" },
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

    it("disposes of the run's context after the run, and waits for it", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* () {
        yield { n: 1 };
      });
      let disposed = false;
      const dispose = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        disposed = true;
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      await m.executor.executeRun(
        deps(collector, dispose),
        run!,
        Date.now() + 60_000,
      );
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(disposed).toBe(true);
      expect(await runRow(id)).toMatchObject({ status: "succeeded" });
    });

    it("disposes of the run's context when the collector fails too", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* () {
        yield* [];
        throw new m.errors.CollectorStop(
          "error",
          "failed",
          "This page took too long to read, so we stopped.",
          { code: "page_too_slow" },
        );
      });
      const dispose = vi.fn(async () => undefined);
      const run = await m.executor.claimNextRun(m.db, new Date());
      await m.executor.executeRun(
        deps(collector, dispose),
        run!,
        Date.now() + 60_000,
      );
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(await runRow(id)).toMatchObject({
        status: "failed",
        errorDetail: { code: "page_too_slow" },
      });
    });

    it("logs a dispose that throws and still records the run's outcome", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* () {
        yield { n: 1 };
      });
      const dispose = vi.fn(async () => {
        throw new Error("worker would not stop");
      });
      const serverLog = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const run = await m.executor.claimNextRun(m.db, new Date());
      try {
        await expect(
          m.executor.executeRun(
            deps(collector, dispose),
            run!,
            Date.now() + 60_000,
          ),
        ).resolves.toEqual({ status: "succeeded", stopReason: "complete" });
        expect(serverLog).toHaveBeenCalledWith(
          `[collectors] run ${id} could not release its resources`,
          expect.objectContaining({ message: "worker would not stop" }),
        );
      } finally {
        serverLog.mockRestore();
      }
      expect(await runRow(id)).toMatchObject({
        status: "succeeded",
        itemCount: 1,
      });
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

  describe("CollectorRuns", () => {
    function facade(over: Partial<Runs.CollectorRunsDeps> = {}) {
      const kicks: number[] = [];
      const collector = getCollector("feed-items")!;
      const runs = m.runs.createCollectorRuns({
        db: m.db,
        enabled: () => true,
        catalog: {
          all: () => [collector],
          get: (id) => (id === collector.id ? collector : undefined),
        },
        kick: () => kicks.push(1),
        now: () => new Date("2026-10-03T12:00:00Z"),
        quota: { runsPerDay: 20, activePerUser: 2, activePlatform: 1_000 },
        ...over,
      });
      return { runs, kicks };
    }
    const feedInput = { url: "https://example.com/feed.xml" };

    it("reports usage and names the quota limit that refused a start", async () => {
      const userId = await makeUser();
      const { runs } = facade({
        quota: { runsPerDay: 20, activePerUser: 1, activePlatform: 1_000 },
      });
      expect(await runs.usage(userId)).toEqual({
        runsToday: 0,
        runsPerDay: 20,
      });
      await runs.startRun({
        userId,
        origin: "web",
        collectorId: "feed-items",
        input: feedInput,
      });
      expect(await runs.usage(userId)).toEqual({
        runsToday: 1,
        runsPerDay: 20,
      });
      const refused = await runs.startRun({
        userId,
        origin: "web",
        collectorId: "feed-items",
        input: feedInput,
      });
      expect(refused).toMatchObject({
        ok: false,
        reason: "quota",
        quotaReason: "active_limit",
      });
    });

    it("refuses everything while the feature is off", async () => {
      const userId = await makeUser();
      const { runs, kicks } = facade({ enabled: () => false });
      expect(
        await runs.startRun({
          userId,
          origin: "web",
          collectorId: "feed-items",
          input: feedInput,
        }),
      ).toMatchObject({ ok: false, reason: "disabled" });
      expect(kicks).toHaveLength(0);
    });

    it("refuses an unknown collector and invalid input, storing nothing", async () => {
      const userId = await makeUser();
      const { runs } = facade();
      expect(
        await runs.startRun({
          userId,
          origin: "web",
          collectorId: "nope",
          input: {},
        }),
      ).toMatchObject({ ok: false, reason: "unknown_collector" });
      const invalid = await runs.startRun({
        userId,
        origin: "web",
        collectorId: "feed-items",
        input: { url: "ftp://x" },
      });
      expect(invalid).toMatchObject({ ok: false, reason: "invalid_input" });
      expect(
        invalid.ok === false && invalid.fieldErrors?.url?.length,
      ).toBeTruthy();
      expect((await runs.listRuns(userId)).runs).toHaveLength(0);
    });

    it("queues a run with its version, origin, agent and expiry, then kicks the worker", async () => {
      const userId = await makeUser();
      const { runs, kicks } = facade();
      const result = await runs.startRun({
        userId,
        agentId: "agent-1",
        origin: "mcp",
        collectorId: "feed-items",
        input: feedInput,
      });
      expect(result.ok).toBe(true);
      const view = await runs.getRun(
        userId,
        (result as { runId: string }).runId,
      );
      expect(view).toMatchObject({
        collectorId: "feed-items",
        collectorVersion: 1,
        origin: "mcp",
        agentId: "agent-1",
        status: "queued",
        input: feedInput,
        expiresAt: "2026-11-02T12:00:00.000Z",
      });
      expect(kicks).toHaveLength(1);
    });

    it("never lets simultaneous starts pass the active limit", async () => {
      const userId = await makeUser();
      const { runs, kicks } = facade();
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          runs.startRun({
            userId,
            origin: "web",
            collectorId: "feed-items",
            input: feedInput,
          }),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(2);
      expect(results.filter((r) => !r.ok && r.reason === "quota")).toHaveLength(
        2,
      );
      expect(kicks).toHaveLength(2);
    });

    it("tells the member when the daily limit frees up", async () => {
      const userId = await makeUser();
      await insertRun(userId, {
        status: "succeeded",
        createdAt: new Date("2026-10-03T11:00:00Z"),
      });
      const { runs, kicks } = facade({
        quota: { runsPerDay: 1, activePerUser: 2, activePlatform: 1_000 },
      });
      expect(
        await runs.startRun({
          userId,
          origin: "web",
          collectorId: "feed-items",
          input: feedInput,
        }),
      ).toEqual({
        ok: false,
        reason: "quota",
        quotaReason: "daily_limit",
        message: "You can start 1 runs per 24 hours. Try again later.",
        retryAt: "2026-10-04T11:00:00.000Z",
      });
      expect(kicks).toHaveLength(0);
    });

    it("still reports a committed start when waking the worker fails", async () => {
      const userId = await makeUser();
      const { runs } = facade({
        kick: () => {
          throw new Error("after() outside a request");
        },
      });
      const serverLog = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const result = await runs.startRun({
          userId,
          origin: "web",
          collectorId: "feed-items",
          input: feedInput,
        });
        expect(result.ok).toBe(true);
        const runId = (result as { runId: string }).runId;
        expect(await runs.getRun(userId, runId)).toMatchObject({
          status: "queued",
        });
        expect(serverLog).toHaveBeenCalledWith(
          "[collectors] could not wake the worker",
          expect.objectContaining({ message: "after() outside a request" }),
        );
      } finally {
        serverLog.mockRestore();
      }
    });

    it("shows a run only to its owner", async () => {
      const owner = await makeUser();
      const other = await makeUser();
      const id = await insertRun(owner, { collectorId: "feed-items" });
      const { runs } = facade();
      expect(await runs.getRun(owner, id)).not.toBeNull();
      expect(await runs.getRun(other, id)).toBeNull();
      expect(await runs.listItems(other, id)).toBeNull();
      expect(await runs.exportRun(other, id, "csv")).toBeNull();
    });

    it("lists runs newest first with a working cursor", async () => {
      const userId = await makeUser();
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        ids.push(
          await insertRun(userId, {
            createdAt: new Date(Date.UTC(2026, 9, 1, i)),
          }),
        );
      }
      const { runs } = facade();
      const page1 = await runs.listRuns(userId, { limit: 2 });
      expect(page1.runs.map((r) => r.id)).toEqual([ids[2], ids[1]]);
      const page2 = await runs.listRuns(userId, {
        limit: 2,
        cursor: page1.nextCursor!,
      });
      expect(page2.runs.map((r) => r.id)).toEqual([ids[0]]);
      expect(page2.nextCursor).toBeNull();
    });

    it("pages items by seq and exports them", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId, {
        collectorId: "feed-items",
        status: "succeeded",
      });
      const row = (n: number) => ({
        title: `T${n}`,
        url: null,
        publishedAt: null,
        author: null,
        summary: n === 1 ? "=HYPERLINK()" : "",
      });
      await m.db
        .insert(m.schema.collectorItems)
        .values([0, 1, 2].map((seq) => ({ runId: id, seq, data: row(seq) })));
      const { runs } = facade();
      const first = await runs.listItems(userId, id, { limit: 2 });
      expect(first?.items.map((i) => i.title)).toEqual(["T0", "T1"]);
      const second = await runs.listItems(userId, id, {
        afterSeq: first!.nextSeq!,
        limit: 2,
      });
      expect(second).toEqual({ items: [row(2)], nextSeq: null });

      const csv = await runs.exportRun(userId, id, "csv");
      let out = "";
      for await (const chunk of csv!.body) out += chunk;
      expect(out.split("\r\n")[0]).toBe("title,url,publishedAt,author,summary");
      expect(out).toContain("'=HYPERLINK()");
      expect(csv!.filename).toMatch(/^feed-items-[0-9a-f]{8}\.csv$/);
      expect(csv!.contentType).toBe("text/csv; charset=utf-8");
    });

    it("describes collectors in the member's language with a JSON input schema", () => {
      const { runs } = facade();
      const [summary] = runs.listCollectors("nl");
      expect(summary).toMatchObject({
        id: "feed-items",
        kind: "feed",
        title: "Feeditems",
        fields: [{ name: "url", label: "Feedadres" }],
      });
      expect(summary!.inputJsonSchema).toMatchObject({ type: "object" });
    });
  });
});
