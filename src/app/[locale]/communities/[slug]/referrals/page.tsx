"use client";

import { use } from "react";
import { ReferralPanel } from "@/components/communities/referral/referral-panel";
import { ReferralLeaderboard } from "@/components/communities/referral/referral-leaderboard";

export default function CommunityReferralsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  return (
    <div className="space-y-6">
      <ReferralPanel slug={slug} />
      <ReferralLeaderboard />
    </div>
  );
}
