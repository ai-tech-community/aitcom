import { describe, expect, it } from "vitest";

import { normalizeSubscriberEmail } from "./subscriptions";

describe("subscriber addresses", () => {
  it("normalizes an address", () => {
    expect(normalizeSubscriberEmail("  Ann@Example.COM ")).toBe(
      "ann@example.com",
    );
  });

  it("refuses what cannot be an address", () => {
    for (const address of [
      "ann",
      "ann@example",
      "a b@example.com",
      "a@@example.com",
      `${"a".repeat(243)}@example.com`,
    ]) {
      expect(normalizeSubscriberEmail(address)).toBeNull();
    }
  });
});
