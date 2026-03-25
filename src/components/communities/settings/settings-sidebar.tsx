"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface SettingsSidebarProps {
  slug: string;
  memberRole: "owner" | "admin" | "moderator" | "member";
}

interface NavItem {
  key: string;
  href: string;
  ownerOnly?: boolean;
}

export function SettingsSidebar({ slug, memberRole }: SettingsSidebarProps) {
  const t = useTranslations("communities.settings.sidebar");
  const pathname = usePathname();

  const basePath = `/communities/${slug}/settings`;

  const items: NavItem[] = [
    { key: "general", href: `${basePath}/general` },
    { key: "members", href: `${basePath}/members` },
    { key: "invites", href: `${basePath}/invites` },
    { key: "rules", href: `${basePath}/rules` },
    { key: "ownership", href: `${basePath}/ownership`, ownerOnly: true },
  ];

  const visibleItems = items.filter(
    (item) => !item.ownerOnly || memberRole === "owner",
  );

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden w-48 shrink-0 space-y-1 md:block">
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
              {t(item.key as "general" | "members" | "invites" | "rules" | "ownership")}
            </Link>
          );
        })}
      </nav>

      {/* Mobile horizontal tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b pb-2 md:hidden">
        {visibleItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.key}
              href={item.href as never}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(item.key as "general" | "members" | "invites" | "rules" | "ownership")}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
