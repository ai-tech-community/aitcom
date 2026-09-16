"use client";

import { useState, type ReactNode } from "react";

import type { StartupProfileExtraTab } from "@/lib/investigations/startups";
import { cn } from "@/lib/utils";

export type StartupsProfileTabCopy = {
  overview: string;
  news: string;
  hiring: string;
  funding: string;
  team: string;
  nav: string;
};

type ProfileTab = "overview" | StartupProfileExtraTab;

export function StartupsProfileTabs({
  extraTabs,
  copy,
  aside,
  overview,
  news,
  hiring,
  funding,
  team,
}: {
  extraTabs: readonly StartupProfileExtraTab[];
  copy: StartupsProfileTabCopy;
  aside?: ReactNode;
  overview: ReactNode;
  news?: ReactNode;
  hiring?: ReactNode;
  funding?: ReactNode;
  team?: ReactNode;
}) {
  const [tab, setTab] = useState<ProfileTab>("overview");
  const showChrome = extraTabs.length > 0;
  const panels: Array<{ id: ProfileTab; node: ReactNode }> = [
    { id: "overview", node: overview },
    ...extraTabs.flatMap((id) => {
      const node =
        id === "news"
          ? news
          : id === "hiring"
            ? hiring
            : id === "funding"
              ? funding
              : team;
      return node ? [{ id, node }] : [];
    }),
  ];

  return (
    <div className="flex flex-col gap-8">
      {showChrome || aside ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {showChrome ? (
            <nav
              aria-label={copy.nav}
              data-startup-profile-tabs=""
              className="bg-secondary text-muted-foreground inline-flex items-center gap-0.5 rounded-md p-0.5 text-sm"
            >
              <TabButton
                active={tab === "overview"}
                label={copy.overview}
                tab="overview"
                onSelect={setTab}
              />
              {extraTabs.map((id) => (
                <TabButton
                  key={id}
                  active={tab === id}
                  label={copy[id]}
                  tab={id}
                  onSelect={setTab}
                />
              ))}
            </nav>
          ) : (
            <span />
          )}
          {aside}
        </div>
      ) : null}
      {panels.map((panel) => (
        <div
          key={panel.id}
          data-startup-profile-panel={panel.id}
          hidden={showChrome && tab !== panel.id}
        >
          {panel.node}
        </div>
      ))}
    </div>
  );
}

function TabButton({
  active,
  label,
  tab,
  onSelect,
}: {
  active: boolean;
  label: string;
  tab: ProfileTab;
  onSelect: (tab: ProfileTab) => void;
}) {
  return (
    <button
      type="button"
      data-startup-profile-tab={tab}
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(tab)}
      className={cn(
        "inline-flex h-7 items-center rounded-[inherit] px-2.5 font-medium whitespace-nowrap transition-colors",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
        active
          ? "bg-background text-foreground shadow-xs"
          : "hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
