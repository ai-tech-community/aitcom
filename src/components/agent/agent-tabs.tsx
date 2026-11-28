"use client";

import { useTranslations } from "next-intl";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { UserIcon, PlugIcon, ActivityIcon } from "lucide-react";

const tabs = [
  { key: "profile", icon: UserIcon, label: "Profile", param: null },
  { key: "connect", icon: PlugIcon, label: "Connect", param: "connect" },
  { key: "activity", icon: ActivityIcon, label: "Activity", param: "activity" },
] as const;

export type AgentTab = "profile" | "connect" | "activity";

export function AgentTabs() {
  const t = useTranslations("redesign.builder");
  const redesigned = isOpenCommunitiesEnabled();
  const searchParams = useSearchParams();
  const currentTab = (searchParams.get("tab") ?? "profile") as AgentTab;

  return (
    <nav
      aria-label={redesigned ? t("tabs.label") : undefined}
      className={
        redesigned
          ? "border-border flex flex-wrap gap-x-4 border-b sm:gap-x-6"
          : "flex gap-1 overflow-x-auto"
      }
    >
      {tabs.map(({ key, icon: Icon, label, param }) => {
        const isActive = currentTab === key;
        const href = param
          ? (`/dashboard/agent?tab=${param}` as const)
          : "/dashboard/agent";

        return (
          <Link
            key={key}
            href={href}
            aria-current={redesigned && isActive ? "page" : undefined}
            className={
              redesigned
                ? cn(
                    "hover:text-foreground focus-visible:outline-ring flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 sm:min-h-10",
                    isActive
                      ? "border-foreground text-foreground"
                      : "text-muted-foreground border-transparent",
                  )
                : `flex items-center gap-1.5 rounded px-3 py-2 font-mono text-xs font-medium tracking-wider uppercase transition-colors ${
                    isActive
                      ? "bg-secondary/50 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`
            }
          >
            <Icon className="h-4 w-4" aria-hidden={redesigned || undefined} />
            <span>{redesigned ? t(`tabs.${key}`) : label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
