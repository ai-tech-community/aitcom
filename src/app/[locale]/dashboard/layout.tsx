import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

/**
 * Auth gate for every dashboard route. The page frame (width, gutters) is
 * owned by each route group's layout: the member dashboard runs full width,
 * the agent workspace and onboarding keep the default centred column.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDashboardSession();

  return children;
}
