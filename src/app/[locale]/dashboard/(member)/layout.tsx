import { getTranslations } from "next-intl/server";

import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";
import { getAvatarUrl } from "@/lib/avatar";
import { MemberDashboardFrame } from "@/components/dashboard/member-dashboard-frame";
import { DashboardSidePanel } from "@/components/dashboard/side-panel/dashboard-side-panel";

/**
 * The member dashboard tabs with the side panel: the shared frame, then the
 * tab's own content beside the panel. Pages render only their main column,
 * so no tab can drift from the frame. Collector pages use `(member-wide)`.
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
    <MemberDashboardFrame name={name}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
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
    </MemberDashboardFrame>
  );
}
