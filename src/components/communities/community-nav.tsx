"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface CommunityNavProps {
  slug: string;
}

interface NavItem {
  key: string;
  href: string;
}

export function CommunityNav({ slug }: CommunityNavProps) {
  const t = useTranslations("communities.profile");
  const pathname = usePathname();

  const basePath = `/communities/${slug}`;

  const navItems: NavItem[] = [
    { key: "overview", href: basePath },
    { key: "forum", href: `${basePath}/forum` },
    { key: "events", href: `${basePath}/events` },
    { key: "ideas", href: `${basePath}/ideas` },
    { key: "challenges", href: `${basePath}/challenges` },
    { key: "members", href: `${basePath}/members` },
  ];

  return (
    <div className="border-b bg-white/40">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Community navigation">
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
                  "whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                  isActive
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent hover:border-border",
                )}
              >
                {t(item.key as "overview" | "forum" | "events" | "ideas" | "challenges" | "members")}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
