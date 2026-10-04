import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectorsHome } from "@/components/collectors/collectors-home";
import { collectorsEnabled } from "@/server/collectors/flags";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Data collectors tab: the main column only; the frame is the layout's. */
export default async function DashboardCollectorsPage() {
  if (!collectorsEnabled()) notFound();
  await requireDashboardSession();
  return <CollectorsHome />;
}
