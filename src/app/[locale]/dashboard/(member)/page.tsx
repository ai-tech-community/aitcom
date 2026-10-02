import type { Metadata } from "next";

import { ActivityFeed } from "@/components/activity-feed";
import { ActiveChallengesWidget } from "@/components/challenges/active-challenges-widget";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Home tab: the main column only — the frame (greeting, tabs, side panel)
 * comes from the member layout. Challenges and personal activity hold this
 * space until "Next up" and "From your communities" replace them.
 */
export default function DashboardHomePage() {
  return (
    <div className="space-y-10">
      <ActiveChallengesWidget />
      <ActivityFeed />
    </div>
  );
}
