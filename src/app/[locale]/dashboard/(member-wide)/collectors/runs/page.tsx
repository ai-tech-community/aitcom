import type { Metadata } from "next";

import { RunHistory } from "@/components/collectors/run-history";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** My runs: every run the member started, newest first, with older pages. */
export default async function CollectorRunsPage() {
  await requireDashboardSession();
  return <RunHistory />;
}
