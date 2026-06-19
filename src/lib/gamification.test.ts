import { describe, expect, it } from "vitest";

import { computeStreakData, tierForXp } from "@/lib/gamification";

describe("computeStreakData", () => {
  it("returns zeros for no activity", () => {
    expect(computeStreakData([], "2026-06-19")).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      total: 0,
      streak: [],
    });
  });

  it("collapses consecutive days into one period", () => {
    const r = computeStreakData(
      ["2026-06-15", "2026-06-16", "2026-06-17"],
      "2026-06-17",
    );
    expect(r.streak).toEqual([
      { periodStart: "2026-06-15", periodEnd: "2026-06-17" },
    ]);
    expect(r.longestStreak).toBe(3);
    expect(r.currentStreak).toBe(3);
    expect(r.total).toBe(3);
  });

  it("splits non-consecutive days into separate periods", () => {
    const r = computeStreakData(
      ["2026-06-10", "2026-06-11", "2026-06-15"],
      "2026-06-15",
    );
    expect(r.streak).toHaveLength(2);
    expect(r.longestStreak).toBe(2);
    expect(r.total).toBe(3);
  });

  it("counts the current streak when the last active day is today", () => {
    expect(
      computeStreakData(["2026-06-18", "2026-06-19"], "2026-06-19")
        .currentStreak,
    ).toBe(2);
  });

  it("keeps the current streak alive with a one-day grace (yesterday)", () => {
    expect(
      computeStreakData(["2026-06-17", "2026-06-18"], "2026-06-19")
        .currentStreak,
    ).toBe(2);
  });

  it("resets the current streak after a 2+ day gap, preserving longest", () => {
    const r = computeStreakData(
      ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-10"],
      "2026-06-19",
    );
    expect(r.currentStreak).toBe(0);
    expect(r.longestStreak).toBe(3);
  });
});

describe("tierForXp", () => {
  it("maps XP to the highest reached tier", () => {
    expect(tierForXp(0).key).toBe("beginner");
    expect(tierForXp(499).key).toBe("beginner");
    expect(tierForXp(500).key).toBe("novice");
    expect(tierForXp(2100).key).toBe("expert");
    expect(tierForXp(99999).key).toBe("enlightened");
  });
});
