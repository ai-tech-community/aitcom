"use client";

import { useTranslations } from "next-intl";
import { RouteTabs } from "@/components/ui/route-tabs";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
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
  const t = useTranslations("redesign.events");
  const base = `/events/${slug}`;

  if (isOpenCommunitiesEnabled()) {
    return (
      <RouteTabs
        aria-label={t("hackathonNav")}
        activeTone="ink"
        className="min-h-11"
        tabs={tabs.map(({ key, available }) => ({
          href: SEGMENTS[key] ? `${base}/${SEGMENTS[key]}` : base,
          label: (
            <span className={available ? undefined : "opacity-75"}>
              {labels[key]}
            </span>
          ),
          match: SEGMENTS[key] ? "prefix" : "exact",
        }))}
      />
    );
  }

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
