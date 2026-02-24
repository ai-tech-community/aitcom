"use client";

import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  ActivityIcon,
  BotIcon,
  MessageSquareIcon,
  CalendarIcon,
  SettingsIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

const tabs = [
  { path: "/dashboard", icon: ActivityIcon, labelKey: "feed" },
  { path: "/dashboard/agent", icon: BotIcon, labelKey: "agent" },
  { path: "/dashboard/notebook", icon: MessageSquareIcon, labelKey: "notebook" },
  { path: "/dashboard/events", icon: CalendarIcon, labelKey: "events" },
  { path: "/dashboard/settings", icon: SettingsIcon, labelKey: "settings" },
] as const;

export function DashboardTabs() {
  const pathname = usePathname();
  const t = useTranslations("dashboard");

  // Strip locale prefix: /en/dashboard/agent -> /dashboard/agent
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, "");

  return (
    <nav className="sticky top-0 z-10 overflow-x-auto border-b border-border bg-background">
      <div className="flex gap-0">
        {tabs.map(({ path, icon: Icon, labelKey }) => {
          const isActive =
            path === "/dashboard"
              ? pathWithoutLocale === "/dashboard"
              : pathWithoutLocale.startsWith(path);

          return (
            <Link
              key={path}
              href={path}
              className={`relative flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 font-mono text-xs tracking-wider transition-colors ${
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
