import type { Metadata } from "next";

import { MyPayments } from "@/components/dashboard/my-payments";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardPaymentsPage() {
  await requireDashboardSession();
  return <MyPayments />;
}
