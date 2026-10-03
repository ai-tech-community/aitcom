import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StartRunForm } from "@/components/collectors/start-run-form";
import { collectorsEnabled } from "@/server/collectors/flags";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Start a run: one collector's form, drawn from its input schema. */
export default async function StartCollectorRunPage({
  params,
}: {
  params: Promise<{ collectorId: string }>;
}) {
  if (!collectorsEnabled()) notFound();
  await requireDashboardSession();
  const { collectorId } = await params;
  return <StartRunForm collectorId={collectorId} />;
}
