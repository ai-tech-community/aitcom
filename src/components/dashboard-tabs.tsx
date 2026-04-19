"use client";

import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  ActivityIcon,
  CalendarIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

const tabs = [
  { path: "/dashboard", icon: ActivityIcon, labelKey: "feed" },
  { path: "/dashboard/communities", icon: UsersIcon, labelKey: "communities" },
  { path: "/dashboard/events", icon: CalendarIcon, labelKey: "events" },
  { path: "/dashboard/settings", icon: SettingsIcon, labelKey: "settings" },
] as const;

export function DashboardTabs() {
  const pathname = usePathname();
  const t = useTranslations("dashboard");

  // Strip locale prefix: /en/dashboard/events -> /dashboard/events
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
            className={`flex items-center gap-1.5 rounded px-3 py-2 font-mono text-xs font-medium tracking-wider uppercase transition-colors ${
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
