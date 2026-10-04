import { notFound } from "next/navigation";

import { CollectorWorkspace } from "@/components/collectors/collector-workspace";
import { collectorsEnabled } from "@/server/collectors/flags";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

/**
 * Every collector page sits in one workspace; the rail stays mounted while
 * the member moves between presets, My runs and runs. Pages keep their own
 * flag and session checks (layouts do not re-run on navigation).
 */
export default async function CollectorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!collectorsEnabled()) notFound();
  await requireDashboardSession();
  return <CollectorWorkspace>{children}</CollectorWorkspace>;
}
