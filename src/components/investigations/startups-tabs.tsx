import { Link } from "@/i18n/navigation";
import {
  STARTUPS_INSIGHTS_PATH,
  STARTUPS_PATH,
} from "@/lib/investigations/startups";
import { cn } from "@/lib/utils";

export type StartupsTab = "directory" | "insights";

export function StartupsTabs({
  active,
  directoryLabel,
  insightsLabel,
  navLabel,
}: {
  active: StartupsTab;
  directoryLabel: string;
  insightsLabel: string;
  navLabel: string;
}) {
  return (
    <nav
      aria-label={navLabel}
      className="bg-secondary text-muted-foreground inline-flex items-center gap-0.5 rounded-md p-0.5 text-sm"
    >
      <TabLink
        href={STARTUPS_PATH}
        active={active === "directory"}
        label={directoryLabel}
      />
      <TabLink
        href={STARTUPS_INSIGHTS_PATH}
        active={active === "insights"}
        label={insightsLabel}
      />
    </nav>
  );
}

function TabLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-7 items-center rounded-[inherit] px-2.5 font-medium whitespace-nowrap transition-colors",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
        active
          ? "bg-background text-foreground shadow-xs"
          : "hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
