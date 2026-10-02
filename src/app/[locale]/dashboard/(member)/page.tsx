import type { Metadata } from "next";

import { ActivityFeed } from "@/components/activity-feed";
import { NextUp } from "@/components/dashboard/next-up/next-up";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Home tab: the main column only — the frame (greeting, tabs, side panel)
 * comes from the member layout. Next up leads; personal activity holds the
 * second place until "From your communities" replaces it.
 */
export default function DashboardHomePage() {
  return (
    <div className="space-y-10">
      <NextUp />
      <ActivityFeed />
    </div>
  );
}
