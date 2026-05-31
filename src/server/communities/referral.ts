/** Pure referral-credit decision. No DB. ADR-0018: credit only on activation. */

import type { ActivationStage } from "@/server/communities/activation";

export type ReferralCreditReason =
  | "ok"
  | "already_credited"
  | "no_referrer"
  | "self_referral"
  | "not_activated";

/** Decide whether a referrer earns credit for a referred member. */
export function decideReferralCredit(opts: {
  referrerId: string | null;
  referredUserId: string;
  activationStage: ActivationStage;
  alreadyCredited: boolean;
}): { credit: boolean; reason: ReferralCreditReason } {
  if (opts.alreadyCredited)
    return { credit: false, reason: "already_credited" };
  if (!opts.referrerId) return { credit: false, reason: "no_referrer" };
  if (opts.referrerId === opts.referredUserId)
    return { credit: false, reason: "self_referral" };
  if (opts.activationStage !== "activated")
    return { credit: false, reason: "not_activated" };
  return { credit: true, reason: "ok" };
}
