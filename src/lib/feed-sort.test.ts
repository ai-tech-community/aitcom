import { describe, expect, it } from "vitest";
import { MAX_PINS } from "./feed-sort";

describe("MAX_PINS", () => {
  it("caps pins at 3", () => {
    expect(MAX_PINS).toBe(3);
  });
});
