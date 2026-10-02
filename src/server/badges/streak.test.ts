// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const evaluateBadges = vi.fn(async () => []);
vi.mock("@/server/badges/engine", () => ({ evaluateBadges }));

const { evaluateStreakOncePerDay, resetStreakMemo } =
  await import("@/server/badges/streak");

const db = {} as never;

describe("evaluateStreakOncePerDay", () => {
  beforeEach(() => {
    evaluateBadges.mockClear();
    resetStreakMemo();
  });

  it("evaluates the Streak track once per member per UTC day", async () => {
    const morning = new Date("2026-10-02T08:00:00Z");
    const evening = new Date("2026-10-02T22:00:00Z");
    const nextDay = new Date("2026-10-03T00:30:00Z");

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
});
