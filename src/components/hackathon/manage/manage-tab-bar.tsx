"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

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
  const pathname = usePathname();
  const base = `/communities/${communitySlug}/events/${eventSlug}/manage`;

  return (
    <nav
      aria-label="Manage sections"
      className="flex gap-1 overflow-x-auto border-b"
    >
      {ORDER.map((key) => {
        const seg = SEGMENTS[key];
        const href = seg ? `${base}/${seg}` : base;
        const active =
          seg === ""
            ? pathname === base
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "border-foreground text-foreground"
                : "text-foreground/60 hover:text-foreground border-transparent",
            )}
          >
            {labels[key]}
          </Link>
        );
      })}
    </nav>
  );
}
