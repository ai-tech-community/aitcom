"use client";

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
  const searchParams = useSearchParams();
  const currentTab = (searchParams.get("tab") ?? "profile") as AgentTab;

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {tabs.map(({ key, icon: Icon, label, param }) => {
        const isActive = currentTab === key;
        const href = param
          ? (`/dashboard/agent?tab=${param}` as const)
          : "/dashboard/agent";

        return (
          <Link
            key={key}
            href={href}
            className={`flex items-center gap-1.5 rounded px-3 py-2 font-mono text-xs font-medium uppercase tracking-wider transition-colors ${
              isActive
                ? "bg-secondary/50 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
