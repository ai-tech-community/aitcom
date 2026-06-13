"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { HubTabKey, HubTabState } from "@/server/hackathon/hub-tabs";

const SEGMENTS: Record<HubTabKey, string> = {
  overview: "",
  timeline: "timeline",
  projects: "projects",
  participants: "participants",
  team: "team",
  workspace: "workspace",
  agents: "agents",
  winners: "winners",
};

export function HackathonTabBar({
  slug,
  tabs,
  labels,
}: {
  slug: string;
  tabs: HubTabState[];
  labels: Record<HubTabKey, string>;
}) {
  const pathname = usePathname();
  const base = `/events/${slug}`;

  return (
    <nav
      aria-label="Hackathon sections"
      className="flex gap-1 overflow-x-auto border-b"
    >
      {tabs.map((tab) => {
        const seg = SEGMENTS[tab.key];
        const href = seg ? `${base}/${seg}` : base;
        const active =
          seg === ""
            ? pathname === base
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "border-foreground text-foreground"
                : "text-foreground/60 hover:text-foreground border-transparent",
              !tab.available && "opacity-70",
            )}
          >
            {labels[tab.key]}
          </Link>
        );
      })}
    </nav>
  );
}
