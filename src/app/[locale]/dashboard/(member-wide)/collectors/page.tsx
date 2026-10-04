import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectorsLanding } from "@/components/collectors/collectors-landing";
import { collectorsEnabled } from "@/server/collectors/flags";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Data collectors tab: the workspace with no site open. */
export default async function DashboardCollectorsPage() {
  if (!collectorsEnabled()) notFound();
  await requireDashboardSession();
  return <CollectorsLanding />;
}
