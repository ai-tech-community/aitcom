"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { SectionLabel } from "@/components/ui/section-label";
import { cn } from "@/lib/utils";
import { magazineSettingsPath } from "@/lib/magazines/paths";

interface SettingsSidebarProps {
  slug: string;
  memberRole: "owner" | "admin" | "moderator" | "member";
}

type SettingsSectionKey =
  | "general"
  | "themes"
  | "spaces"
  | "members"
  | "matching"
  | "invites"
  | "rules"
  | "newsSources"
  | "topics"
  | "links"
  | "classroom"
  | "magazine"
  | "broadcast"
  | "autonomy"
  | "acquire"
  | "integrations"
  | "payments"
  | "ownership";

interface NavItem {
  key: SettingsSectionKey;
  href: string;
  ownerOnly?: boolean;
}

const settingsGroups = {
  community: ["general", "themes", "integrations", "spaces"],
  people: ["members", "matching", "invites", "rules"],
  publishing: [
    "newsSources",
    "topics",
    "links",
    "classroom",
    "magazine",
    "broadcast",
  ],
  operations: ["autonomy", "acquire", "payments", "ownership"],
} as const satisfies Record<string, readonly SettingsSectionKey[]>;

export function SettingsSidebar({ slug, memberRole }: SettingsSidebarProps) {
  const t = useTranslations("communities.settings.sidebar");
  const groups = useTranslations("redesign.builder.settingsGroups");
  const pathname = usePathname();

  const basePath = `/communities/${slug}/settings`;
  const redesigned = isOpenCommunitiesEnabled();
  const integrations: NavItem = {
    key: "integrations",
    href: `${basePath}/integrations`,
    ownerOnly: true,
  };

  const items: NavItem[] = [
    { key: "general", href: `${basePath}/general` },
    { key: "themes", href: `${basePath}/themes` },
    { key: "spaces", href: `${basePath}/spaces` },
    { key: "members", href: `${basePath}/members` },
    { key: "matching", href: `${basePath}/matching` },
    { key: "invites", href: `${basePath}/invites` },
    { key: "rules", href: `${basePath}/rules` },
    { key: "newsSources", href: `${basePath}/news` },
    { key: "topics", href: `${basePath}/topics` },
    { key: "links", href: `${basePath}/links` },
    { key: "classroom", href: `${basePath}/classroom` },
    { key: "magazine", href: magazineSettingsPath(slug) },
    { key: "broadcast", href: `${basePath}/broadcast` },
    { key: "autonomy", href: `${basePath}/autonomy` },
    { key: "acquire", href: `${basePath}/acquire` },
    integrations,
    { key: "payments", href: `${basePath}/payments`, ownerOnly: true },
    { key: "ownership", href: `${basePath}/ownership`, ownerOnly: true },
  ];

  const visibleItems = items.filter(
    (item) => !item.ownerOnly || memberRole === "owner",
  );

  if (redesigned) {
    return (
      <nav
        aria-label={groups("label")}
        tabIndex={0}
        className="focus-visible:outline-ring flex min-w-0 gap-4 overflow-x-auto border-b pb-2 focus-visible:outline-2 focus-visible:-outline-offset-2 @3xl:sticky @3xl:top-24 @3xl:block @3xl:max-h-[calc(100dvh-7rem)] @3xl:w-48 @3xl:shrink-0 @3xl:space-y-2 @3xl:self-start @3xl:overflow-y-auto @3xl:border-b-0 @3xl:pb-3 @3xl:[scrollbar-gutter:stable]"
      >
        {Object.entries(settingsGroups).map(([group, keys]) => {
          const members = keys.flatMap((key) =>
            visibleItems.filter((item) => item.key === key),
          );
          if (!members.length) return null;
          return (
            <div
              key={group}
              className="border-border shrink-0 border-e pe-3 last:border-e-0 @3xl:border-e-0 @3xl:pe-0"
            >
              <SectionLabel bordered={false} className="px-3 pb-1.5">
                {groups(group as keyof typeof settingsGroups)}
              </SectionLabel>
              <ul className="flex gap-1 @3xl:block">
                {members.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href as never}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "focus-visible:outline-ring flex min-h-11 items-center rounded-md px-3 text-xs font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 @3xl:min-h-7 @3xl:text-sm @3xl:whitespace-normal",
                          active
                            ? "bg-secondary text-foreground"
                            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                        )}
                      >
                        {t(item.key)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    );
  }

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden w-48 shrink-0 space-y-1 @3xl:sticky @3xl:top-24 @3xl:block @3xl:self-start">
        {visibleItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.key}
              href={item.href as never}
              className={cn(
                "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              )}
            >
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

      {/* Mobile horizontal tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b pb-2 @3xl:hidden">
        {visibleItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.key}
              href={item.href as never}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
