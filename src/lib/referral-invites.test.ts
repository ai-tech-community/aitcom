import { describe, expect, it } from "vitest";
import {
  inviteAttributionSearch,
  parseReferralEmails,
  referralBatchInput,
  referralInvitePath,
  validReferralEmail,
} from "./referral-invites";

describe("referral invitation input and attribution", () => {
  it("normalizes pasted comma, whitespace and semicolon lists without guessing email aliases", () => {
    expect(
      parseReferralEmails(
        " ALEX@example.com; alex@example.com\nsam+ait@example.com ",
      ),
    ).toEqual(["alex@example.com", "sam+ait@example.com"]);
    expect(validReferralEmail("not-an-email")).toBe(false);
    expect(
      validReferralEmail("name@example.com\r\nBcc: other@example.com"),
    ).toBe(false);
  });
  it("rejects oversized batches, invalid addresses and untrusted locale values", () => {
    const base = {
      requestId: crypto.randomUUID(),
      emails: ["friend@example.com"],
    };
    expect(referralBatchInput.parse(base).slug).toBe("ait");
    expect(referralBatchInput.safeParse({ ...base, emails: [] }).success).toBe(
      false,
    );
    expect(
      referralBatchInput.safeParse({
        ...base,
        emails: Array(11).fill("friend@example.com"),
      }).success,
    ).toBe(false);
    expect(
      referralBatchInput.safeParse({ ...base, locale: "xx" }).success,
    ).toBe(false);
    expect(
      referralBatchInput.safeParse({ ...base, emails: ["broken"] }).success,
    ).toBe(false);
  });
  it("retains only referral attribution through authentication, never an injected redirect", () => {
    const path = referralInvitePath("nl", "safe-code", "delivery-id");
    const url = new URL(path, "https://example.test");
    expect(url.pathname).toBe("/nl/invite/safe-code");
    expect(url.searchParams.get("ref")).toBe("safe-code");
    expect(url.searchParams.get("utm_medium")).toBe("email");
    const search = inviteAttributionSearch({
      delivery: "delivery-id",
      ref: "safe-code",
      utm_campaign: "friend-invite",
      redirect: "https://evil.test",
      token: "private",
      utm_source: ["bad", "input"],
    });
    expect(new URLSearchParams(search).get("delivery")).toBe("delivery-id");
    expect(search).not.toContain("evil");
    expect(search).not.toContain("private");
    expect(search).not.toContain("utm_source");
  });
});
