"use client";

import { RouteTabs } from "@/components/ui/route-tabs";

/**
 * News and Stories are equal destinations. The active tab is ink, so Signal
 * Orange stays on the page's one primary action (sharing a rumor).
 */
export function NewsSectionTabs({
  label,
  news,
  stories,
}: {
  label: string;
  news: string;
  stories: string;
}) {
  return (
    <RouteTabs
      aria-label={label}
      activeTone="ink"
      tabs={[
        { href: "/news", label: news, match: "exact" },
        { href: "/news/stories", label: stories, match: "exact" },
      ]}
    />
  );
}
