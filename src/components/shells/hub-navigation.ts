"use client";

import { useTranslations } from "next-intl";
import {
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Compass,
  CreditCard,
  House,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Newspaper,
  Rocket,
  Search,
  Settings,
  UserRound,
  Workflow,
} from "lucide-react";
import { JOIN_HREF, keyboardNavItems } from "@/components/site-nav";
import type { ShellDestination, ShellNavGroup } from "./navigation";

const primary = [
  ["/communities", Compass],
  ["/events", CalendarDays],
  ["/magazines", BookOpen],
  ["/launchpad", Rocket],
  ["/jobs", BriefcaseBusiness],
  ["/news", Newspaper],
  ["/investigations", Search],
] as const;

export function useHubNavigation(signedIn: boolean) {
  const t = useTranslations("redesign.shell");
  const nav = useTranslations("nav");
  const hubHome = { href: "/", label: t("home"), exact: true, icon: House };
  const destinations = keyboardNavItems();
  const main: ShellDestination[] = primary.map(([href, icon]) => {
    const key = destinations.find((item) => item.href === href)?.key;
    return {
      href,
      icon,
      label: key && key !== "explore" ? nav(key) : t("discover"),
    };
  });
  const other = destinations
    .filter(({ href }) => !primary.some(([path]) => path === href))
    .map(({ href, key }) => ({ href, label: nav(key) }));
  const account: ShellDestination[] = signedIn
    ? [
        { href: "/dashboard", label: t("dashboard"), icon: LayoutDashboard },
        {
          href: "/dashboard/communities",
          label: t("myCommunities"),
          icon: LayoutGrid,
        },
        { href: "/dashboard/events", label: t("myEvents"), icon: CalendarDays },
        {
          href: "/dashboard/notifications",
          label: t("notifications"),
          icon: Bell,
        },
        { href: "/dashboard/settings", label: t("settings"), icon: Settings },
        { href: "/dashboard/payments", label: t("payments"), icon: CreditCard },
        {
          href: "/dashboard/onboarding",
          label: t("onboardingQuestions"),
          icon: ListChecks,
        },
        { href: "/dashboard/agent", label: nav("myAgent"), icon: Workflow },
        {
          href: "/dashboard/jobs",
          label: t("jobTracker"),
          icon: BriefcaseBusiness,
        },
      ]
    : [
        { href: "/auth/signin", label: nav("signIn"), icon: UserRound },
        { href: JOIN_HREF, label: nav("join"), icon: UserRound },
      ];
  const groups: ShellNavGroup[] = [
    { label: t("hub"), items: [hubHome, ...main, ...other] },
    { label: t("account"), items: account },
  ];

  return { main, account, groups };
}
