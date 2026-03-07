import { describe, expect, it } from "vitest";
import {
  formatDurationMinutes,
  getContributionMixWidths,
} from "./impact-display";

describe("formatDurationMinutes", () => {
  it("formats long durations into days and hours", () => {
    expect(formatDurationMinutes(3231)).toBe("2d 5h");
  });

  it("formats hour-scale durations cleanly", () => {
    expect(formatDurationMinutes(95)).toBe("1h 35m");
  });
});

describe("getContributionMixWidths", () => {
  it("uses row totals rather than global totals", () => {
    expect(
      getContributionMixWidths({
        aiOnly: 2,
        humanOnly: 1,
        collaborative: 1,
      }),
    ).toEqual({
      aiOnly: 50,
      humanOnly: 25,
      collaborative: 25,
    });
  });
});
