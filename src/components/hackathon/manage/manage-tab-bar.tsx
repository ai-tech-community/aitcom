"use client";

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
  const base = `/communities/${communitySlug}/events/${eventSlug}/manage`;

  return (
    <RouteTabs
      aria-label="Manage sections"
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
