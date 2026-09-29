import { describe, expect, it } from "vitest";

import {
  canSeeEventOrganizers,
  canSetEventOrganizer,
  isEligibleOrganizer,
} from "./event-organizer";

const EVENT = { organizerId: "org-1", communityId: "c-1" };
const active = (role: string) => ({ role, status: "active" });

describe("canSetEventOrganizer", () => {
  it.each([
    ["the community owner", "owner-1", active("owner"), true],
    ["the current organizer", "org-1", active("member"), true],
    ["the current organizer who is an admin", "org-1", active("admin"), true],
    ["an admin who does not organize it", "admin-1", active("admin"), false],
    ["a moderator", "mod-1", active("moderator"), false],
    ["another member", "m-1", active("member"), false],
    // Leaving deletes the membership row.
    ["the organizer after leaving", "org-1", null, false],
    [
      "the organizer while only invited",
      "org-1",
      { role: "member", status: "invited" },
      false,
    ],
    ["a banned owner", "owner-1", { role: "owner", status: "banned" }, false],
    ["someone outside the community", "x-1", null, false],
  ])("%s → %s", (_who, actorId, actorMembership, expected) => {
    expect(
      canSetEventOrganizer({ event: EVENT, actorId, actorMembership }),
    ).toBe(expected);
  });

  it("lets the owner assign an event that has no organizer", () => {
    expect(
      canSetEventOrganizer({
        event: { organizerId: null, communityId: "c-1" },
        actorId: "owner-1",
        actorMembership: active("owner"),
      }),
    ).toBe(true);
  });

  it("never matches a missing organizer to a member", () => {
    expect(
      canSetEventOrganizer({
        event: { organizerId: null, communityId: "c-1" },
        actorId: "",
        actorMembership: active("member"),
      }),
    ).toBe(false);
  });

  it("refuses an event outside a community", () => {
    expect(
      canSetEventOrganizer({
        event: { organizerId: "org-1", communityId: null },
        actorId: "org-1",
        actorMembership: active("owner"),
      }),
    ).toBe(false);
  });
});

describe("isEligibleOrganizer", () => {
  it("takes active members of any role", () => {
    expect(isEligibleOrganizer(active("member"))).toBe(true);
    expect(isEligibleOrganizer(active("owner"))).toBe(true);
  });

  it("refuses pending, banned and missing memberships", () => {
    expect(
      isEligibleOrganizer({ role: "member", status: "pending_approval" }),
    ).toBe(false);
    expect(isEligibleOrganizer({ role: "member", status: "banned" })).toBe(
      false,
    );
    expect(isEligibleOrganizer(null)).toBe(false);
  });
});

describe("canSeeEventOrganizers", () => {
  it("shows organizers to active owners and admins only", () => {
    expect(canSeeEventOrganizers(active("owner"))).toBe(true);
    expect(canSeeEventOrganizers(active("admin"))).toBe(true);
    expect(canSeeEventOrganizers(active("moderator"))).toBe(false);
    expect(canSeeEventOrganizers(active("member"))).toBe(false);
    expect(canSeeEventOrganizers({ role: "admin", status: "banned" })).toBe(
      false,
    );
    expect(canSeeEventOrganizers(null)).toBe(false);
  });
});
