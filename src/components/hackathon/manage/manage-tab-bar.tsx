"use client";

import { useTranslations } from "next-intl";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { RouteTabs } from "@/components/ui/route-tabs";

type ManageTabKey = "setup" | "tasks" | "analytics" | "lifecycle";

const SEGMENTS: Record<ManageTabKey, string> = {
  setup: "",
  tasks: "tasks",
  analytics: "analytics",
  lifecycle: "lifecycle",
};

const ORDER: ManageTabKey[] = ["setup", "tasks", "analytics", "lifecycle"];

export function ManageTabBar({
  communitySlug,
  eventSlug,
  labels,
}: {
  communitySlug: string;
  eventSlug: string;
  labels: Record<ManageTabKey, string>;
}) {
  const redesign = isOpenCommunitiesEnabled();
  const t = useTranslations("redesign.events");
  const base = `/communities/${communitySlug}/events/${eventSlug}/manage`;

  return (
    <RouteTabs
      aria-label={redesign ? t("hackathonNav") : "Manage sections"}
      activeTone={redesign ? "ink" : undefined}
      className={redesign ? "min-h-11 [&_a]:min-h-11" : undefined}
      tabs={ORDER.map((key) => {
        const seg = SEGMENTS[key];
        return {
          href: seg ? `${base}/${seg}` : base,
          label: labels[key],
          match: seg ? "prefix" : "exact",
        };
      })}
    />
  );
}
