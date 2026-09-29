import { describe, expect, it } from "vitest";
import { VIEW_STATUSES, parseAttendeeView } from "./attendee-views";

describe("parseAttendeeView", () => {
  it("takes a known view and falls back to active", () => {
    expect(parseAttendeeView("waitlisted")).toBe("waitlisted");
    expect(parseAttendeeView("everything")).toBe("active");
    expect(parseAttendeeView(null)).toBe("active");
  });
});

describe("VIEW_STATUSES", () => {
  it("keeps cancelled people out of the active view", () => {
    expect(VIEW_STATUSES.active).not.toContain("cancelled");
    expect(VIEW_STATUSES.active).not.toContain("payment_failed");
    expect(VIEW_STATUSES.cancelled).toEqual(["cancelled", "payment_failed"]);
  });
});
