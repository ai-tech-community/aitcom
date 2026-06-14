import { describe, it, expect } from "vitest";
import {
  hasActiveGrant,
  resolveHackathonCapability,
  type StaffGrantRow,
} from "./staff-roles";

const admin = { status: "active", role: "admin" as const };
const member = { status: "active", role: "member" as const };
const organizerGrant: StaffGrantRow = { role: "organizer", revokedAt: null };
const judgeGrant: StaffGrantRow = { role: "judge", revokedAt: null };
const revokedJudge: StaffGrantRow = { role: "judge", revokedAt: new Date() };

describe("hasActiveGrant", () => {
  it("is true for a matching active grant", () => {
    expect(hasActiveGrant([judgeGrant], "judge")).toBe(true);
  });
  it("ignores revoked grants", () => {
    expect(hasActiveGrant([revokedJudge], "judge")).toBe(false);
  });
  it("is false when the role is absent", () => {
    expect(hasActiveGrant([organizerGrant], "judge")).toBe(false);
  });
});

describe("resolveHackathonCapability", () => {
  it("returns 'admin' for an active community owner/admin regardless of grants", () => {
    expect(resolveHackathonCapability(admin, [judgeGrant])).toBe("admin");
  });
  it("returns 'organizer' for a non-admin with an active organizer grant", () => {
    expect(resolveHackathonCapability(member, [organizerGrant])).toBe(
      "organizer",
    );
  });
  it("prefers 'organizer' over 'judge' when both grants are held", () => {
    expect(
      resolveHackathonCapability(member, [organizerGrant, judgeGrant]),
    ).toBe("organizer");
  });
  it("returns 'judge' for a non-admin with only an active judge grant", () => {
    expect(resolveHackathonCapability(member, [judgeGrant])).toBe("judge");
  });
  it("returns null for a plain member with no active grants", () => {
    expect(resolveHackathonCapability(member, [revokedJudge])).toBe(null);
  });
  it("returns null for no membership and no grants", () => {
    expect(resolveHackathonCapability(null, [])).toBe(null);
  });
});
