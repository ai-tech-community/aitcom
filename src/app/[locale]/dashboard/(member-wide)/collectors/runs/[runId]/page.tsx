import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectorRun } from "@/components/collectors/collector-run";
import { collectorsEnabled } from "@/server/collectors/flags";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** One run: live status, why it stopped, its rows, downloads and log. */
export default async function CollectorRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  if (!collectorsEnabled()) notFound();
  await requireDashboardSession();
  const { runId } = await params;
  return <CollectorRun runId={runId} />;
}
