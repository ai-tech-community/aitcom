// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  activityWindowStart,
  toProfileActivity,
} from "@/server/members/profile-activity";

describe("activityWindowStart", () => {
  it("covers 365 days, today included", () => {
    expect(activityWindowStart("2026-10-02")).toBe("2025-10-03");
  });
});

describe("toProfileActivity", () => {
  const today = "2026-10-02";

  it("keeps calendar days inside the window but streaks over all time", () => {
    const old = ["2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04"];
    const recent = ["2026-09-30", "2026-10-01", "2026-10-02"];
    const activity = toProfileActivity(
      [...old, ...recent].map((date) => ({ date, xp: 10 })),
      today,
    );
    expect(activity.days.map((d) => d.date)).toEqual(recent);
    expect(activity.currentStreak).toBe(3);
    expect(activity.longestStreak).toBe(4);
  });

  it("returns only dates and day totals", () => {
    const activity = toProfileActivity(
      [{ date: today, xp: 25, reason: "secret" } as never],
      today,
    );
    expect(activity.days).toEqual([{ date: today, xp: 25 }]);
    expect(Object.keys(activity).sort()).toEqual([
      "currentStreak",
      "days",
      "longestStreak",
    ]);
  });

  it("is empty with no activity", () => {
    expect(toProfileActivity([], today)).toEqual({
      days: [],
      currentStreak: 0,
      longestStreak: 0,
    });
  });
});
