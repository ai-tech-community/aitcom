import { describe, it, expect } from "vitest";
import { decideReferralCredit } from "./referral";
import type { ActivationStage } from "@/server/communities/activation";

const base = {
  referrerId: "ref",
  referredUserId: "newbie",
  activationStage: "activated" as ActivationStage,
  alreadyCredited: false,
};

describe("decideReferralCredit", () => {
  it("credits an activated, uncredited, non-self referral", () => {
    expect(decideReferralCredit(base)).toEqual({ credit: true, reason: "ok" });
  });

  it("does not credit when already credited (short-circuits first)", () => {
    expect(decideReferralCredit({ ...base, alreadyCredited: true })).toEqual({
      credit: false,
      reason: "already_credited",
    });
  });

  it("does not credit with no referrer", () => {
    expect(decideReferralCredit({ ...base, referrerId: null })).toEqual({
      credit: false,
      reason: "no_referrer",
    });
  });

  it("blocks self-referral", () => {
    expect(decideReferralCredit({ ...base, referrerId: "newbie" })).toEqual({
      credit: false,
      reason: "self_referral",
    });
  });

  it("does not credit before activation", () => {
    for (const stage of [
      "unactivated",
      "awaiting_response",
      "awaiting_profile",
      "stalled",
    ] as ActivationStage[]) {
      expect(decideReferralCredit({ ...base, activationStage: stage })).toEqual(
        { credit: false, reason: "not_activated" },
      );
    }
  });
});
