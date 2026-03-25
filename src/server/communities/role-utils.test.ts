import { describe, it, expect } from "vitest";
import { canManageRole, ROLE_HIERARCHY } from "./role-utils";

describe("ROLE_HIERARCHY", () => {
  it("ranks owner highest", () => {
    expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.admin);
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.moderator);
    expect(ROLE_HIERARCHY.moderator).toBeGreaterThan(ROLE_HIERARCHY.member);
  });
});

describe("canManageRole", () => {
  it("owner can manage admin", () => {
    expect(canManageRole("owner", "admin")).toBe(true);
  });
  it("owner can manage moderator", () => {
    expect(canManageRole("owner", "moderator")).toBe(true);
  });
  it("owner can manage member", () => {
    expect(canManageRole("owner", "member")).toBe(true);
  });
  it("admin can manage moderator", () => {
    expect(canManageRole("admin", "moderator")).toBe(true);
  });
  it("admin can manage member", () => {
    expect(canManageRole("admin", "member")).toBe(true);
  });
  it("admin cannot manage admin", () => {
    expect(canManageRole("admin", "admin")).toBe(false);
  });
  it("admin cannot manage owner", () => {
    expect(canManageRole("admin", "owner")).toBe(false);
  });
  it("moderator can manage member", () => {
    expect(canManageRole("moderator", "member")).toBe(true);
  });
  it("moderator cannot manage moderator", () => {
    expect(canManageRole("moderator", "moderator")).toBe(false);
  });
  it("member cannot manage anyone", () => {
    expect(canManageRole("member", "member")).toBe(false);
  });
  it("owner cannot manage owner", () => {
    expect(canManageRole("owner", "owner")).toBe(false);
  });
});
