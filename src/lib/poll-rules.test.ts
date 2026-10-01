import { describe, expect, it } from "vitest";

import { pollPercentages, pollProblem } from "./poll-rules";

describe("pollProblem", () => {
  it("accepts 2 to 4 filled, different answers", () => {
    expect(pollProblem(["Yes", "No"])).toBeNull();
    expect(pollProblem(["a", "b", "c", "d"])).toBeNull();
  });

  it("names what is wrong", () => {
    expect(pollProblem(["Only one"])).toBe("tooFew");
    expect(pollProblem(["a", "b", "c", "d", "e"])).toBe("tooMany");
    expect(pollProblem(["Yes", "  "])).toBe("empty");
    expect(pollProblem(["Yes", " yes "])).toBe("duplicate");
    expect(pollProblem(["Yes", "x".repeat(81)])).toBe("tooLong");
  });
});

describe("pollPercentages", () => {
  it("gives whole percentages that add up to 100", () => {
    expect(pollPercentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(pollPercentages([2, 1])).toEqual([67, 33]);
    expect(pollPercentages([5, 0])).toEqual([100, 0]);
  });

  it("is all zero with no votes", () => {
    expect(pollPercentages([0, 0])).toEqual([0, 0]);
  });
});
