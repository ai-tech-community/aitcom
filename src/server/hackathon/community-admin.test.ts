import { describe, it, expect } from "vitest";
import { isCommunityHackathonAdmin } from "./community-admin";

describe("isCommunityHackathonAdmin", () => {
  it("accepts an active owner", () => {
    expect(isCommunityHackathonAdmin({ status: "active", role: "owner" })).toBe(
      true,
    );
  });
  it("accepts an active admin", () => {
    expect(isCommunityHackathonAdmin({ status: "active", role: "admin" })).toBe(
      true,
    );
  });
  it("rejects a moderator", () => {
    expect(
      isCommunityHackathonAdmin({ status: "active", role: "moderator" }),
    ).toBe(false);
  });
  it("rejects a member", () => {
    expect(
      isCommunityHackathonAdmin({ status: "active", role: "member" }),
    ).toBe(false);
  });
  it("rejects an inactive owner", () => {
    expect(
      isCommunityHackathonAdmin({ status: "pending_approval", role: "owner" }),
    ).toBe(false);
  });
  it("rejects null (no membership)", () => {
    expect(isCommunityHackathonAdmin(null)).toBe(false);
  });
});
