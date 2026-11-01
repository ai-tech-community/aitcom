// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  recipientHash,
  referralOptOutToken,
  verifyReferralOptOut,
} from "./tokens";

describe("account-free referral unsubscribe tokens", () => {
  const secret = "stable-test-secret-at-least-32-characters";
  it("matches recipient normalization without retaining the raw address", () => {
    const hash = recipientHash(" FRIEND@example.com ", secret);
    expect(hash).toBe(recipientHash("friend@example.com", secret));
    const token = referralOptOutToken(hash, secret);
    expect(token).not.toContain("friend");
    expect(token).not.toContain("@");
    expect(verifyReferralOptOut(token, secret)).toBe(hash);
  });
  it("rejects modifications, wrong secrets, malformed inputs and cross-purpose signatures", () => {
    const hash = recipientHash("friend@example.com", secret);
    const token = referralOptOutToken(hash, secret);
    expect(verifyReferralOptOut(token, "another-secret")).toBeNull();
    expect(verifyReferralOptOut(`${hash}.invalid`, secret)).toBeNull();
    expect(
      verifyReferralOptOut(token.replace(hash, "0".repeat(64)), secret),
    ).toBeNull();
    expect(verifyReferralOptOut("", secret)).toBeNull();
    expect(verifyReferralOptOut("x".repeat(10000), secret)).toBeNull();
  });
});
