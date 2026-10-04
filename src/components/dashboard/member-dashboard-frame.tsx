import { getTranslations } from "next-intl/server";

import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { collectorsEnabled } from "@/server/collectors/flags";

/**
 * The member dashboard frame, shared by its route groups: greeting (the
 * page's one h1), the tabs, then the group's content. `(member)` puts the
 * side panel beside its tabs; `(member-wide)` (the collector workspace) uses
 * the full width. Full width on the top nav's `px-4 sm:px-8` gutters — a
 * named exception to the default page frame (DESIGN.md "Page frame").
 */
export async function MemberDashboardFrame({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations("dashboard");
  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {t("greeting", { name })}
      </h1>

      <div className="mt-6">
        <DashboardTabs showCollectors={collectorsEnabled()} />
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}
