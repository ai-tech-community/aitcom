import type { Metadata } from "next";

import { CollectorRun } from "@/components/collectors/collector-run";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** One run: live status, why it stopped, its rows, downloads and log. */
export default async function CollectorRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  await requireDashboardSession();
  const { runId } = await params;
  return <CollectorRun runId={runId} />;
}
