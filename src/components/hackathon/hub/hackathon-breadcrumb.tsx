"use client";

import { Link, usePathname } from "@/i18n/navigation";
import type { HubTabKey } from "@/server/hackathon/hub-tabs";

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

export function HackathonBreadcrumb({
  slug,
  title,
  labels,
}: {
  slug: string;
  title: string;
  labels: Record<HubTabKey, string>;
}) {
  const pathname = usePathname();
  const base = `/events/${slug}`;

  // Determine the active tab the same way the tab bar does, so the breadcrumb
  // leaf reflects the section the viewer is currently on.
  const activeKey = (Object.keys(SEGMENTS) as HubTabKey[]).find((key) => {
    const seg = SEGMENTS[key];
    const href = seg ? `${base}/${seg}` : base;
    return seg === ""
      ? pathname === base
      : pathname === href || pathname.startsWith(`${href}/`);
  });

  // On the overview tab the leaf would just repeat the event title link.
  const leaf = activeKey && activeKey !== "overview" ? labels[activeKey] : null;

  return (
    <nav className="mb-6 flex items-center gap-2 font-mono text-[11px] tracking-wider">
      <Link
        href="/events"
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        / EVENTS
      </Link>
      <span className="text-muted-foreground">/</span>
      <Link
        href={base}
        className="text-muted-foreground hover:text-foreground truncate transition-colors"
      >
        {title}
      </Link>
      {leaf && (
        <>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground/80">{leaf}</span>
        </>
      )}
    </nav>
  );
}
