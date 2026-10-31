import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { cleanupExpiredRuns, expiredRuns, RETENTION_BATCH } from "./retention";
import { claimNextRun } from "./executor";
import { createCollectorRuns } from "./runs";
import type { SQL } from "drizzle-orm";
const now = new Date("2026-10-31T12:00:00Z");
const query = (sql: SQL) => new PgDialect().sqlToQuery(sql);
describe("dataset retention", () => {
  it("restricts deletion to expired runs without an active worker lease", () => {
    const built = query(expiredRuns(now)!);
    expect(built.sql).toContain('"expiresAt" <=');
    expect(built.sql).toContain('"leaseUntil" <=');
    expect(built.sql).toContain('"leaseUntil" is null');
    expect(built.params).toContain("running");
    expect(built.sql).toContain(" or ");
  });
  it("locks and deletes only one bounded batch, and repeated empty ticks are safe", async () => {
    const rows = [{ id: "expired" }];
    const select = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValueOnce(rows).mockResolvedValue([]),
    };
    const deletion = {
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(rows),
    };
    const tx = { select: () => select, delete: vi.fn(() => deletion) };
    const db = { transaction: async (fn: (v: unknown) => unknown) => fn(tx) };
    expect(await cleanupExpiredRuns(db as never, now)).toBe(1);
    expect(select.limit).toHaveBeenCalledWith(RETENTION_BATCH);
    expect(select.for).toHaveBeenCalledWith("update", { skipLocked: true });
    expect(query(deletion.where.mock.calls[0]![0] as SQL).params).toContain(
      "expired",
    );
    expect(await cleanupExpiredRuns(db as never, now)).toBe(0);
    expect(tx.delete).toHaveBeenCalledTimes(1);
  });
  it("does not claim an expired queued run", async () => {
    const builder = {
      from: () => builder,
      where: vi.fn((_sql: SQL) => builder),
      orderBy: () => builder,
      limit: () => builder,
      for: async () => [],
    };
    const db = {
      transaction: async (fn: (v: unknown) => unknown) =>
        fn({ select: () => builder }),
    };
    expect(await claimNextRun(db as never, now)).toBeNull();
    expect(query(builder.where.mock.calls[0]![0]).sql).toContain(
      '"expiresAt" >',
    );
  });
  it("hides expired data from run, item and export entry points before cleanup", async () => {
    const builder = {
      from: () => builder,
      where: vi.fn((_sql: SQL) => builder),
      limit: async () => [],
    };
    const db = { select: () => builder };
    const runs = createCollectorRuns({
      db: db as never,
      enabled: () => true,
      catalog: { all: () => [], get: () => undefined, everything: () => [] },
      presets: { all: () => [], get: () => undefined },
      kick: () => undefined,
      now: () => now,
    });
    expect(await runs.getRun("owner", "expired")).toBeNull();
    expect(await runs.listItems("owner", "expired")).toBeNull();
    expect(await runs.exportRun("owner", "expired", "csv")).toBeNull();
    for (const [sql] of builder.where.mock.calls) {
      const built = query(sql);
      expect(built.sql).toContain('"expiresAt" >');
      expect(built.params).toContain("owner");
      expect(built.params).toContain("expired");
    }
  });
});
