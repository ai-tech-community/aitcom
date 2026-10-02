import { describe, expect, it } from "vitest";

import { isCommunityOrganizer } from "./organizer-roles";

describe("isCommunityOrganizer", () => {
  it("is true for owners and admins only", () => {
    expect(isCommunityOrganizer("owner")).toBe(true);
    expect(isCommunityOrganizer("admin")).toBe(true);
    expect(isCommunityOrganizer("moderator")).toBe(false);
    expect(isCommunityOrganizer("member")).toBe(false);
  });
});
