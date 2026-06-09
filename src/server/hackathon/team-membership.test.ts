import { describe, it, expect } from "vitest";
import { assertCanJoinTeam } from "./team-membership";

describe("assertCanJoinTeam", () => {
  it("passes for a forming team below max size", () => {
    expect(() =>
      assertCanJoinTeam({ status: "forming", currentSize: 2, maxSize: 5 }),
    ).not.toThrow();
  });

  it("throws when the team is full", () => {
    expect(() =>
      assertCanJoinTeam({ status: "forming", currentSize: 5, maxSize: 5 }),
    ).toThrow(/full/i);
  });

  it("throws when the roster is locked", () => {
    expect(() =>
      assertCanJoinTeam({ status: "locked", currentSize: 1, maxSize: 5 }),
    ).toThrow(/locked/i);
  });

  it("throws when the team is disbanded", () => {
    expect(() =>
      assertCanJoinTeam({ status: "disbanded", currentSize: 0, maxSize: 5 }),
    ).toThrow(/disbanded|not open/i);
  });
});
