import { describe, it, expect } from "vitest";
import {
  normalizeEmail,
  isLikelyEmail,
  isInviteRedeemable,
  STAFF_INVITE_TTL_DAYS,
  inviteExpiry,
} from "./staff-invite";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
});

describe("isLikelyEmail", () => {
  it("accepts a normal address", () => {
    expect(isLikelyEmail("judge@example.com")).toBe(true);
  });
  it("rejects a bare token / partial", () => {
    expect(isLikelyEmail("judge")).toBe(false);
    expect(isLikelyEmail("judge@")).toBe(false);
    expect(isLikelyEmail("judge@example")).toBe(false);
  });
});

describe("isInviteRedeemable", () => {
  const now = new Date("2026-06-14T00:00:00.000Z");
  const base = { revokedAt: null, redeemedAt: null, expiresAt: null };
  it("is true for a fresh unexpired invite", () => {
    expect(isInviteRedeemable(base, now)).toBe(true);
  });
  it("is false when revoked", () => {
    expect(isInviteRedeemable({ ...base, revokedAt: now }, now)).toBe(false);
  });
  it("is false when already redeemed", () => {
    expect(isInviteRedeemable({ ...base, redeemedAt: now }, now)).toBe(false);
  });
  it("is false when expired", () => {
    expect(
      isInviteRedeemable(
        { ...base, expiresAt: new Date("2026-06-13T00:00:00.000Z") },
        now,
      ),
    ).toBe(false);
  });
  it("is true when expiry is in the future", () => {
    expect(
      isInviteRedeemable(
        { ...base, expiresAt: new Date("2026-06-20T00:00:00.000Z") },
        now,
      ),
    ).toBe(true);
  });
});

describe("inviteExpiry", () => {
  it("returns now + STAFF_INVITE_TTL_DAYS days", () => {
    const now = new Date("2026-06-14T00:00:00.000Z");
    const expected = new Date(
      now.getTime() + STAFF_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(inviteExpiry(now)).toEqual(expected);
  });
});
