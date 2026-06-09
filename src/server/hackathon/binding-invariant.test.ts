import { describe, it, expect } from "vitest";
import { assertBindable } from "./binding-invariant";

describe("assertBindable", () => {
  const base = {
    event: { type: "hackathon", communityId: "comm-1" },
    challenge: { communityId: "comm-1" },
  };

  it("passes when the event is a hackathon and communityIds match", () => {
    expect(() => assertBindable(base.event, base.challenge)).not.toThrow();
  });

  it("passes when both communityIds are null (Hub-wide)", () => {
    expect(() =>
      assertBindable(
        { type: "hackathon", communityId: null },
        { communityId: null },
      ),
    ).not.toThrow();
  });

  it("throws when the event is not a hackathon", () => {
    expect(() =>
      assertBindable({ type: "workshop", communityId: "comm-1" }, base.challenge),
    ).toThrow(/hackathon/i);
  });

  it("throws when communityIds differ", () => {
    expect(() =>
      assertBindable(base.event, { communityId: "comm-2" }),
    ).toThrow(/communityId/i);
  });

  it("treats undefined and null communityId as the same (Hub-wide)", () => {
    expect(() =>
      assertBindable(
        { type: "hackathon", communityId: null },
        { communityId: undefined },
      ),
    ).not.toThrow();
  });
});
