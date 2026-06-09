"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface CommunityNavProps {
  slug: string;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
}

interface NavItem {
  key: string;
  href: string;
}

export function CommunityNav({ slug, memberRole }: CommunityNavProps) {
  const t = useTranslations("communities.profile");
  const pathname = usePathname();

  const basePath = `/communities/${slug}`;
  const isAdminOrOwner = memberRole === "owner" || memberRole === "admin";

  const navItems: NavItem[] = [
    { key: "overview", href: basePath },
    { key: "forum", href: `${basePath}/forum` },
    { key: "events", href: `${basePath}/events` },
    { key: "classroom", href: `${basePath}/classroom` },
    { key: "ideas", href: `${basePath}/ideas` },
    { key: "members", href: `${basePath}/members` },
    ...(memberRole
      ? [{ key: "referrals", href: `${basePath}/referrals` }]
      : []),
    ...(isAdminOrOwner || memberRole === "moderator"
      ? [
          { key: "insights", href: `${basePath}/insights` },
          { key: "rituals", href: `${basePath}/rituals` },
        ]
      : []),
    ...(isAdminOrOwner
      ? [{ key: "settings", href: `${basePath}/settings` }]
      : []),
  ];

  return (
    <div className="bg-background/80 supports-backdrop-filter:bg-background/60 sticky top-12 z-40 border-b backdrop-blur">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <nav
          className="-mb-px flex gap-1 overflow-x-auto"
          aria-label="Community navigation"
        >
          {navItems.map((item) => {
            const isActive =
              item.key === "overview"
                ? pathname === basePath || pathname === `${basePath}/`
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.key}
                href={item.href as never}
                className={cn(
                  "border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:border-border border-transparent",
                )}
              >
                {t(
                  item.key as
                    | "overview"
                    | "forum"
                    | "events"
                    | "classroom"
                    | "ideas"
                    | "members"
                    | "referrals"
                    | "insights"
                    | "rituals"
                    | "settings",
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
