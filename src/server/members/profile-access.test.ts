// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  profileAudience,
  profileReach,
  profileReadableBy,
} from "@/server/members/profile-access";

describe("profileAudience", () => {
  it("is owner only when the signed-in viewer is the profile owner", () => {
    expect(profileAudience("u1", "u1")).toBe("owner");
  });

  it("is visitor for another member or a signed-out viewer", () => {
    expect(profileAudience("u2", "u1")).toBe("visitor");
    expect(profileAudience(null, "u1")).toBe("visitor");
    expect(profileAudience(undefined, "u1")).toBe("visitor");
  });
});

describe("profileReadableBy", () => {
  it("adds no row condition for the owner", () => {
    expect(profileReadableBy("owner")).toBeUndefined();
  });

  it("applies the public roster rule for visitors", () => {
    expect(profileReadableBy("visitor")).toBeDefined();
  });
});

describe("profileReach", () => {
  it("maps public visibility to the reach shown to the owner", () => {
    expect(profileReach(true)).toBe("public");
    expect(profileReach(false)).toBe("owner-only");
  });
});
