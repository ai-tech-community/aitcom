import type { Metadata } from "next";

import { MyCommunities } from "@/components/dashboard/my-communities/my-communities";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** My communities tab: the main column only; the frame is the layout's. */
export default function DashboardCommunitiesPage() {
  return <MyCommunities />;
}
