// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  badgeShareHref,
  badgeShareImageHref,
  profileTabHref,
} from "./member-profile-routes";

describe("profileTabHref", () => {
  it("puts Overview at the profile root and other tabs below it", () => {
    expect(profileTabHref("u1", "overview")).toBe("/members/u1");
    expect(profileTabHref("u1", "badges")).toBe("/members/u1/badges");
    expect(profileTabHref("u1", "agent")).toBe("/members/u1/agent");
  });
});

describe("badgeShareHref", () => {
  it("puts a badge's share page and its image under the Badges tab", () => {
    expect(badgeShareHref("u1", "writer_3")).toBe(
      "/members/u1/badges/writer_3",
    );
    expect(badgeShareImageHref("u1", "benchmark-coverage-10")).toBe(
      "/members/u1/badges/benchmark-coverage-10/image",
    );
  });
});
