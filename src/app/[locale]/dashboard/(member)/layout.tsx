import { getTranslations } from "next-intl/server";

import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";
import { getAvatarUrl } from "@/lib/avatar";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { collectorsEnabled } from "@/server/collectors/flags";
import { DashboardSidePanel } from "@/components/dashboard/side-panel/dashboard-side-panel";

/**
 * The member dashboard frame, shared by every tab: greeting (the page's one
 * h1), tabs, then the tab's own content beside the side panel. Pages render
 * only their main column, so no tab can drift from the frame.
 *
 * Full width, aligned with the top nav's `px-4 sm:px-8` edges — a named
 * exception to the default page frame (DESIGN.md "Page frame").
 */
export default async function MemberDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, t] = await Promise.all([
    requireDashboardSession(),
    getTranslations("dashboard"),
  ]);
  const user = session.user;
  const name = user.name || user.email;

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {t("greeting", { name })}
      </h1>

      <div className="mt-6">
        <DashboardTabs showCollectors={collectorsEnabled()} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Not <main>: the root layout already provides the main landmark. */}
        <div className="min-w-0">{children}</div>
        <aside
          aria-label={t("sidePanelLabel")}
          className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-width:thin]"
        >
          <DashboardSidePanel
            fallbackName={name}
            avatarUrl={getAvatarUrl(user.email, user.image)}
          />
        </aside>
      </div>
    </div>
  );
}
