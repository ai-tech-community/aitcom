import { describe, expect, it } from "vitest";
import { checkInTransition } from "./check-in";

const NOW = new Date("2026-10-05T18:04:00Z");
const EARLIER = new Date("2026-10-05T17:58:00Z");

describe("checkInTransition", () => {
  it("checks a registered member in, stamping the time", () => {
    expect(
      checkInTransition({ status: "registered", checkedInAt: null }, true, NOW),
    ).toEqual({ status: "attended", checkedInAt: NOW });
  });

  it("keeps the first time when checked in twice", () => {
    expect(
      checkInTransition(
        { status: "attended", checkedInAt: EARLIER },
        true,
        NOW,
      ),
    ).toEqual({ status: "attended", checkedInAt: EARLIER });
  });

  it("undoes a check-in", () => {
    expect(
      checkInTransition({ status: "attended", checkedInAt: EARLIER }, false),
    ).toEqual({ status: "registered", checkedInAt: null });
  });

  it.each([
    "waitlisted",
    "pending_payment",
    "cancelled",
    "payment_failed",
    "intent",
  ])("refuses to check in a %s registration", (status) => {
    expect(checkInTransition({ status, checkedInAt: null }, true)).toBeNull();
    expect(checkInTransition({ status, checkedInAt: null }, false)).toBeNull();
  });
});
