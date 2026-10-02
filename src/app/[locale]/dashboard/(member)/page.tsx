import type { Metadata } from "next";

import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";
import { CommunityActivity } from "@/components/dashboard/community-activity/community-activity";
import { NextUp } from "@/components/dashboard/next-up/next-up";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Home tab: the main column only — the frame (greeting, tabs, side panel)
 * comes from the member layout. Next up leads; "From your communities"
 * follows. The member's own activity lives in the You card.
 */
export default async function DashboardHomePage() {
  const session = await requireDashboardSession();

  return (
    <div className="space-y-10">
      <NextUp />
      <CommunityActivity currentUserId={session.user.id} />
    </div>
  );
}
