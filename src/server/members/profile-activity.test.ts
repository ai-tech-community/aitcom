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
    const activity = toProfileActivity([...old, ...recent], today);
    expect(activity).toEqual({
      days: recent,
      currentStreak: 3,
      longestStreak: 4,
    });
  });

  it("is empty with no activity", () => {
    expect(toProfileActivity([], today)).toEqual({
      days: [],
      currentStreak: 0,
      longestStreak: 0,
    });
  });
});
