import { MemberDashboardFrame } from "@/components/dashboard/member-dashboard-frame";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

/**
 * Member dashboard tabs that need the full width (the data collectors
 * workspace): the same greeting and tabs, no side panel. A named exception
 * (DESIGN.md "Page frame").
 */
export default async function MemberWideDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireDashboardSession();
  const name = session.user.name || session.user.email;
  return <MemberDashboardFrame name={name}>{children}</MemberDashboardFrame>;
}
