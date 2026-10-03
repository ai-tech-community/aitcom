import { useTranslations } from "next-intl";

import { RouteTabs, type RouteTab } from "@/components/ui/route-tabs";

/**
 * The member dashboard's tabs, in order. Home is an index route whose path
 * prefixes every other tab, so it matches exactly. Onboarding is a route but
 * not a tab: members reach it from the "Get started" card.
 */
export const DASHBOARD_TABS = [
  { href: "/dashboard", labelKey: "home", match: "exact" },
  { href: "/dashboard/communities", labelKey: "communities" },
  { href: "/dashboard/events", labelKey: "events" },
  { href: "/dashboard/jobs", labelKey: "jobs" },
  { href: "/dashboard/notifications", labelKey: "notifications" },
  { href: "/dashboard/settings", labelKey: "settings" },
] as const satisfies readonly (Omit<RouteTab, "label"> & {
  labelKey: string;
})[];

/** Shown after Job tracker only while data collectors are switched on. */
const COLLECTORS_TAB = {
  href: "/dashboard/collectors",
  labelKey: "collectors",
} as const;

type DashboardTab = (typeof DASHBOARD_TABS)[number] | typeof COLLECTORS_TAB;

/** Tab bar for the member dashboard frame, built on the shared RouteTabs. */
export function DashboardTabs({
  showCollectors = false,
}: {
  showCollectors?: boolean;
}) {
  const t = useTranslations("dashboard");
  const source: readonly DashboardTab[] = showCollectors
    ? DASHBOARD_TABS.flatMap<DashboardTab>((tab) =>
        tab.labelKey === "jobs" ? [tab, COLLECTORS_TAB] : [tab],
      )
    : DASHBOARD_TABS;
  const tabs: RouteTab[] = source.map(({ labelKey, ...tab }) => ({
    ...tab,
    label: t(`tabs.${labelKey}`),
  }));
  return <RouteTabs aria-label={t("tabsLabel")} tabs={tabs} />;
}
