import { useTranslations } from "next-intl";

import {
  PROFILE_TABS,
  profileTabHref,
  type ProfileTab,
} from "@/lib/member-profile-routes";
import { RouteTabs, type RouteTab } from "@/components/ui/route-tabs";

/** The tabs that need a profile; an owner setting one up sees the rest. */
const PROFILE_ONLY_TABS: ReadonlySet<ProfileTab> = new Set([
  "badges",
  "activity",
  "work",
]);

/**
 * The profile's tabs, in order, for this viewer. Overview is the profile
 * root, whose path prefixes every other tab, so it matches exactly. Agent is
 * listed only when the viewer may see the member's agent page. An owner
 * without a profile yet sees Overview (which asks them to set it up) and
 * Agent only.
 */
export function profileTabs(
  userId: string,
  { showAgent, hasProfile }: { showAgent: boolean; hasProfile: boolean },
): (Omit<RouteTab, "label"> & { tab: ProfileTab })[] {
  return PROFILE_TABS.filter((tab) =>
    tab === "agent" ? showAgent : hasProfile || !PROFILE_ONLY_TABS.has(tab),
  ).map((tab) => ({
    tab,
    href: profileTabHref(userId, tab),
    ...(tab === "overview" ? { match: "exact" as const } : {}),
  }));
}

/** Tab bar for the member profile frame, built on the shared RouteTabs. */
export function ProfileTabs({
  userId,
  showAgent,
  hasProfile,
}: {
  userId: string;
  showAgent: boolean;
  hasProfile: boolean;
}) {
  const t = useTranslations("memberProfile");
  const tabs: RouteTab[] = profileTabs(userId, { showAgent, hasProfile }).map(
    ({ tab, ...route }) => ({ ...route, label: t(`tabs.${tab}`) }),
  );
  return <RouteTabs aria-label={t("tabsLabel")} tabs={tabs} />;
}
