import type { Metadata } from "next";
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { DashboardProfile } from "@/components/dashboard-profile";
import { ActivityFeed } from "@/components/activity-feed";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { SocialSuggestions } from "@/components/social-suggestions";
import { ActiveChallengesWidget } from "@/components/challenges/active-challenges-widget";
import { HydrateClient } from "@/trpc/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  return (
    <HydrateClient>
      <div className="space-y-8">
        <DashboardProfile
          userEmail={session.user.email}
          userImage={session.user.image}
          userName={session.user.name}
        />
        <OnboardingChecklist />
        <ActiveChallengesWidget />
        <ActivityFeed />
        <SocialSuggestions />
      </div>
    </HydrateClient>
  );
}
