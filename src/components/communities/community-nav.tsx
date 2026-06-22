"use client";

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import {
  BUILTIN_SURFACES,
  resolveSpaceLabel,
  type BuiltinSurface,
} from "@/server/communities/space-defaults";

interface CommunityNavProps {
  slug: string;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
}

interface NavItem {
  key: string;
  href: string;
  label: string;
  isPrivate?: boolean;
}

export function CommunityNav({ slug, memberRole }: CommunityNavProps) {
  const tRooms = useTranslations("communities.rooms");
  const t = useTranslations("communities.profile");
  const pathname = usePathname();

  const basePath = `/communities/${slug}`;
  const isAdminOrOwner = memberRole === "owner" || memberRole === "admin";

  const { data: spaceTabs, isError: spaceTabsError } = api.spaces.list.useQuery(
    { slug },
  );

  const { data: roomTabs } = api.spaces.listRooms.useQuery({ slug });

  const surfaceItems: NavItem[] = spaceTabsError
    ? BUILTIN_SURFACES.map((s) => ({
        key: `space-${s}`,
        href: `${basePath}/${s}`,
        label: t(s),
      }))
    : (spaceTabs ?? [])
        .filter((s) => s.kind === "builtin" && s.builtinSurface)
        .map((s) => ({
          key: `space-${s.id}`,
          href: `${basePath}/${s.slug}`,
          label: resolveSpaceLabel(
            { kind: s.kind, builtinSurface: s.builtinSurface, name: s.name },
            (k: BuiltinSurface) => t(k),
          ),
        }));

  const roomItems: NavItem[] = (roomTabs ?? []).map((room) => ({
    key: `room-${room.id}`,
    href: `${basePath}/spaces/${room.slug}`,
    label: room.name ?? tRooms("untitled"),
    isPrivate: room.visibility === "private" && room.membership !== "active",
  }));

  const navItems: NavItem[] = [
    { key: "overview", href: basePath, label: t("overview") },
    ...surfaceItems,
    ...roomItems,
    ...(memberRole
      ? [
          {
            key: "referrals",
            href: `${basePath}/referrals`,
            label: t("referrals"),
          },
        ]
      : []),
    ...(isAdminOrOwner || memberRole === "moderator"
      ? [
          {
            key: "insights",
            href: `${basePath}/insights`,
            label: t("insights"),
          },
          { key: "rituals", href: `${basePath}/rituals`, label: t("rituals") },
        ]
      : []),
    ...(isAdminOrOwner
      ? [
          {
            key: "settings",
            href: `${basePath}/settings`,
            label: t("settings"),
          },
        ]
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
                {item.label}
                {item.isPrivate && (
                  <>
                    <Lock
                      className="text-muted-foreground ml-1 inline-block size-3"
                      aria-hidden="true"
                    />
                    <span className="sr-only">private room</span>
                  </>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
