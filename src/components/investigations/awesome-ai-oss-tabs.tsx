import { Link } from "@/i18n/navigation";
import {
  AWESOME_AI_OSS_INSIGHTS_PATH,
  AWESOME_AI_OSS_PATH,
} from "@/lib/investigations/awesome-ai-oss";
import { cn } from "@/lib/utils";

export type AwesomeAiOssTab = "directory" | "insights";

export function AwesomeAiOssTabs({
  active,
  directoryLabel,
  insightsLabel,
  navLabel,
}: {
  active: AwesomeAiOssTab;
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
        href={AWESOME_AI_OSS_PATH}
        active={active === "directory"}
        label={directoryLabel}
      />
      <TabLink
        href={AWESOME_AI_OSS_INSIGHTS_PATH}
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
