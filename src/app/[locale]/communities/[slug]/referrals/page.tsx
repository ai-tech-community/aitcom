import { redirect } from "next/navigation";
import { getSession } from "@/server/better-auth/server";
import { ReferralPanel } from "@/components/communities/referral/referral-panel";
import { ReferralLeaderboard } from "@/components/communities/referral/referral-leaderboard";

export default async function CommunityReferralsPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;
  const session = await getSession();
  if (!session?.user)
    redirect(
      `/${locale}/auth/signin?redirect=${encodeURIComponent(`/${locale}/communities/${slug}/referrals`)}`,
    );
  return (
    <div className="space-y-10">
      <ReferralPanel slug={slug} />
      <ReferralLeaderboard />
    </div>
  );
}
