"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/ui/section-label";
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
  const manageLabelId = useId();
  const navRef = useRef<HTMLElement>(null);

  const basePath = `/communities/${slug}`;
  const isAdminOrOwner = memberRole === "owner" || memberRole === "admin";

  const { data: spaceTabs, isError: spaceTabsError } = api.spaces.list.useQuery(
    { slug },
  );

  const { data: roomTabs } = api.spaces.listRooms.useQuery({ slug });

  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector('[aria-current="page"]');
    if (!nav || !current) return;

    // Reveal the selected tab horizontally without moving the page vertically.
    const revealCurrent = () => {
      if (nav.scrollWidth <= nav.clientWidth) return;
      const tab = current.getBoundingClientRect();
      const strip = nav.getBoundingClientRect();
      if (tab.right > strip.right) nav.scrollLeft += tab.right - strip.right;
      else if (tab.left < strip.left) nav.scrollLeft += tab.left - strip.left;
    };
    revealCurrent();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [pathname, spaceTabs, spaceTabsError, roomTabs, memberRole]);

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

  // Every member's places first: Overview, the spaces, rooms, invites.
  const spaceNavItems: NavItem[] = [
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
  ];

  // Then the tools for running the community, grouped under Manage.
  const manageNavItems: NavItem[] = [
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

  const renderItem = (item: NavItem) => {
    const isActive =
      item.key === "overview"
        ? pathname === basePath || pathname === `${basePath}/`
        : pathname === item.href || pathname.startsWith(`${item.href}/`);

    return (
      <Link
        key={item.key}
        href={item.href as never}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "focus-visible:ring-ring/50 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-inset lg:rounded-md lg:border-b-0 lg:py-2 lg:whitespace-normal",
          isActive
            ? "border-foreground text-foreground lg:bg-secondary"
            : "text-muted-foreground hover:text-foreground hover:border-border lg:hover:bg-secondary/50 border-transparent",
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
  };

  return (
    // A sticky tab bar, edge to edge, on small screens; from `lg` a vertical
    // list in the community rail.
    <div className="bg-background/80 supports-backdrop-filter:bg-background/60 sticky top-12 z-40 -mx-4 border-b px-4 backdrop-blur sm:-mx-8 sm:px-8 lg:static lg:z-auto lg:mx-0 lg:border-t lg:border-b-0 lg:bg-transparent lg:px-0 lg:pt-4 lg:backdrop-blur-none">
      <nav
        ref={navRef}
        className="-mb-px flex gap-1 overflow-x-auto lg:mb-0 lg:flex-col lg:gap-0.5 lg:overflow-visible"
        aria-label="Community navigation"
      >
        {spaceNavItems.map(renderItem)}
        {manageNavItems.length > 0 ? (
          // In the tab bar the group's links simply follow the others; the
          // kicker shows only in the rail's vertical list.
          <div
            role="group"
            aria-labelledby={manageLabelId}
            className="flex shrink-0 gap-1 lg:mt-4 lg:flex-col lg:gap-0.5"
          >
            <SectionLabel
              as="div"
              id={manageLabelId}
              bordered={false}
              className="hidden px-3 pb-1 lg:block"
            >
              {t("manageGroup")}
            </SectionLabel>
            {manageNavItems.map(renderItem)}
          </div>
        ) : null}
      </nav>
    </div>
  );
}
