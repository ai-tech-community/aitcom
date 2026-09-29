import { describe, expect, it } from "vitest";
import { canViewEventAttendees } from "./attendee-access";

const EVENT = { organizerId: "org-1", communityId: "c-1", sourceUrl: null };
const ACTIVE = { status: "active" };

describe("canViewEventAttendees", () => {
  it.each([
    ["the organizer", EVENT, "org-1", ACTIVE, true],
    ["the organizer after leaving", EVENT, "org-1", null, false],
    ["the organizer while banned", EVENT, "org-1", { status: "banned" }, false],
    [
      "a community admin who is not the organizer",
      EVENT,
      "admin-1",
      ACTIVE,
      false,
    ],
    ["another member", EVENT, "m-1", ACTIVE, false],
    ["a guest", EVENT, null, null, false],
    [
      "anyone, for an event without organizer",
      { ...EVENT, organizerId: null },
      "org-1",
      ACTIVE,
      false,
    ],
    [
      "the organizer of an external event",
      { ...EVENT, sourceUrl: "https://lu.ma/x" },
      "org-1",
      ACTIVE,
      false,
    ],
    [
      "the organizer of an event outside a community",
      { ...EVENT, communityId: null },
      "org-1",
      ACTIVE,
      false,
    ],
  ])("%s → %s", (_who, event, viewerId, membership, expected) => {
    expect(canViewEventAttendees({ event, viewerId, membership })).toBe(
      expected,
    );
  });
});
