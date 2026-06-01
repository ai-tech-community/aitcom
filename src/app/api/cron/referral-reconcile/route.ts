import { NextResponse } from "next/server";

import { db } from "@/server/db";
import {
  referralCredits,
  notifications,
  activityEvents,
} from "@/server/db/schema";
import { loadReferralCandidates } from "@/server/communities/referral-queries";
import { decideReferralCredit } from "@/server/communities/referral";
import { computeActivationStage } from "@/server/communities/activation";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const candidates = await loadReferralCandidates(db, now);
  let credited = 0;

  for (const c of candidates) {
    try {
      const stage = computeActivationStage({
        firstContributionAt: c.firstContributionAt,
        firstResponseReceivedAt: c.firstResponseReceivedAt,
        profileComplete: c.profileComplete,
        config: c.config,
        now,
      });
      const decision = decideReferralCredit({
        referrerId: c.referrerId,
        referredUserId: c.referredUserId,
        activationStage: stage,
        alreadyCredited: false, // candidates are pre-filtered to uncredited
      });
      if (!decision.credit) continue;

      // Claim the credit (unique on referred_user_id). Only the winner awards.
      const claimed = await db
        .insert(referralCredits)
        .values({
          referrerId: c.referrerId,
          referredUserId: c.referredUserId,
          communityId: c.communityId,
          xpAwarded: XP_AMOUNTS.REFERRAL_ACTIVATED,
        })
        .onConflictDoNothing()
        .returning({ id: referralCredits.id });
      if (claimed.length === 0) continue; // already credited (race / another community)

      await awardXp(db, c.referrerId, XP_AMOUNTS.REFERRAL_ACTIVATED);

      // Audit event — recipientId deliberately NULL (stay off the privacy filter).
      await db.insert(activityEvents).values({
        actorId: c.referredUserId,
        actorType: "system",
        action: "referral.credited",
        targetType: "user",
        targetId: c.referrerId,
        communityId: c.communityId,
        metadata: { xp: XP_AMOUNTS.REFERRAL_ACTIVATED },
      });

      // Notify the referrer.
      await db.insert(notifications).values({
        userId: c.referrerId,
        type: "referral_credited",
        title: "Your referral activated 🎉",
        content: `A member you referred just became active. You earned ${XP_AMOUNTS.REFERRAL_ACTIVATED} XP.`,
        communityId: c.communityId,
        metadata: {
          referredUserId: c.referredUserId,
          xp: XP_AMOUNTS.REFERRAL_ACTIVATED,
        },
      });
      credited++;
    } catch (err) {
      console.error(`referral-reconcile: failed for ${c.referredUserId}`, err);
      continue;
    }
  }

  return NextResponse.json({ success: true, credited });
}
