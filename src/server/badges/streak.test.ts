// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const ok = { ok: true, earned: [], celebrated: [] };
const failed = { ok: false, earned: [], celebrated: [] };
const evaluateBadges = vi.fn(async () => ok);
vi.mock("@/server/badges/engine", () => ({ evaluateBadges }));

const { evaluateStreakOncePerDay, resetStreakMemo } =
  await import("@/server/badges/streak");

const db = {} as never;
const morning = new Date("2026-10-02T08:00:00Z");
const evening = new Date("2026-10-02T22:00:00Z");
const nextDay = new Date("2026-10-03T00:30:00Z");

describe("evaluateStreakOncePerDay", () => {
  beforeEach(() => {
    evaluateBadges.mockReset();
    evaluateBadges.mockResolvedValue(ok);
    resetStreakMemo();
  });

  it("evaluates the Streak track once per member per UTC day", async () => {
    await evaluateStreakOncePerDay(db, "u1", morning);
    await evaluateStreakOncePerDay(db, "u1", evening);
    await evaluateStreakOncePerDay(db, "u2", evening);
    await evaluateStreakOncePerDay(db, "u1", nextDay);

    expect(evaluateBadges.mock.calls).toEqual([
      [db, "u1", ["streak"]],
      [db, "u2", ["streak"]],
      [db, "u1", ["streak"]],
    ]);
  });

  it("retries the same day after a failed evaluation", async () => {
    evaluateBadges.mockResolvedValueOnce(failed);
    await evaluateStreakOncePerDay(db, "u1", morning);
    await evaluateStreakOncePerDay(db, "u1", evening);
    await evaluateStreakOncePerDay(db, "u1", evening);

    expect(evaluateBadges).toHaveBeenCalledTimes(2);
  });
});
