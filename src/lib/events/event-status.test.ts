import { describe, expect, it } from "vitest";

import { isPubliclyListedEventStatus } from "./event-status";

describe("event status", () => {
  it("lists published, cancelled and completed events only", () => {
    for (const status of ["published", "cancelled", "completed"])
      expect(isPubliclyListedEventStatus(status)).toBe(true);
    for (const status of ["draft", "rejected", "unknown", "", null, undefined])
      expect(isPubliclyListedEventStatus(status)).toBe(false);
  });
});
