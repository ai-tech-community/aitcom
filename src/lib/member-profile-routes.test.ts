// @vitest-environment node
import { describe, expect, it } from "vitest";

import { profileTabHref } from "./member-profile-routes";

describe("profileTabHref", () => {
  it("puts Overview at the profile root and other tabs below it", () => {
    expect(profileTabHref("u1", "overview")).toBe("/members/u1");
    expect(profileTabHref("u1", "badges")).toBe("/members/u1/badges");
    expect(profileTabHref("u1", "agent")).toBe("/members/u1/agent");
  });
});
