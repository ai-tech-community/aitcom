"use client";

import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  ActivityIcon,
  BotIcon,
  CalendarIcon,
  SettingsIcon,
  TrophyIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

const tabs = [
  { path: "/dashboard", icon: ActivityIcon, labelKey: "feed" },
  { path: "/dashboard/agent", icon: BotIcon, labelKey: "agent" },
  { path: "/challenges", icon: TrophyIcon, labelKey: "challenges" },
  { path: "/dashboard/events", icon: CalendarIcon, labelKey: "events" },
  { path: "/dashboard/settings", icon: SettingsIcon, labelKey: "settings" },
] as const;

export function DashboardTabs() {
  const pathname = usePathname();
  const t = useTranslations("dashboard");

  // Strip locale prefix: /en/dashboard/agent -> /dashboard/agent
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, "");

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {tabs.map(({ path, icon: Icon, labelKey }) => {
        const isActive =
          path === "/dashboard"
            ? pathWithoutLocale === "/dashboard"
            : pathWithoutLocale.startsWith(path);

        return (
          <Link
            key={path}
            href={path}
            className={`flex items-center gap-1.5 rounded px-3 py-2 font-mono text-xs font-medium uppercase tracking-wider transition-colors ${
              isActive
                ? "bg-secondary/50 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
