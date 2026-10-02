import { describe, expect, it } from "vitest";

import { buildStreakWeek } from "./streak-week";

describe("buildStreakWeek", () => {
  // Wednesday 2026-09-30, local time.
  const today = new Date(2026, 8, 30, 15, 30);

  it("returns Monday to Sunday of the current week", () => {
    const week = buildStreakWeek([], today);
    expect(week).toHaveLength(7);
    expect(week[0]!.date.getDay()).toBe(1);
    expect(week[6]!.date.getDay()).toBe(0);
    expect(week.filter((d) => d.isToday).map((d) => d.date.getDate())).toEqual([
      30,
    ]);
  });

  it("marks active, idle and future days", () => {
    const week = buildStreakWeek(
      [{ periodStart: "2026-09-29", periodEnd: "2026-09-30" }],
      today,
    );
    expect(week.map((d) => d.state)).toEqual([
      "idle", // Mon 28
      "active", // Tue 29
      "active", // Wed 30 (today)
      "future",
      "future",
      "future",
      "future",
    ]);
  });
});
