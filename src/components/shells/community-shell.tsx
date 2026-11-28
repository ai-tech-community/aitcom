"use client";

import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Ellipsis, House, PanelLeft, type LucideIcon } from "lucide-react";
import { AitLogo } from "@/components/ait-logo";
import { CommunityIdentity } from "@/components/communities/community-identity";
import { useCommunityNavigation } from "@/components/communities/community-navigation";
import { CommunityThemeCover } from "@/components/communities/theme/community-theme-cover";
import { CommunityThemePreviewProvider } from "@/components/communities/theme/community-theme-preview";
import { CommunityThemeScope } from "@/components/communities/theme/community-theme-scope";
import { MessagesNavLink } from "@/components/inbox/messages-nav-link";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type {
  HubAuthUser,
  HubMembershipSeed,
} from "@/server/better-auth/hub-session";
import { CommunitySwitcher } from "./community-switcher";
import { useHubNavigation } from "./hub-navigation";
import { activeDestination, type ShellDestination } from "./navigation";
import { ShellHeader } from "./shell-header";
import { ShellDrawer, ShellNavGroups, ShellNavLink } from "./shell-navigation";
import { useRoomUnread } from "./use-room-unread";

type CommunityShellProps = React.ComponentProps<typeof CommunityIdentity> & {
  user: HubAuthUser | null;
  memberships: readonly HubMembershipSeed[];
  retryMemberships?: () => void;
  showCover: boolean;
  children: ReactNode;
};

const bottomLinkClass =
  "focus-visible:ring-ring hover:bg-secondary flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-md p-1 text-center text-xs leading-tight font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset";

function MobileLabel({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <>
      <Icon className="size-[18px] shrink-0" aria-hidden />
      <span className="max-w-full wrap-break-word">{label}</span>
    </>
  );
}

function SpaceGroup({
  title,
  items,
  active,
  pending,
  failed,
  retry,
  onNavigate,
}: {
  title: string;
  items: readonly ShellDestination[];
  active?: ShellDestination;
  pending?: boolean;
  failed?: boolean;
  retry?: () => void;
  onNavigate?: () => void;
}) {
  const t = useTranslations("common");
  const id = useId();
  if (!items.length && !pending && !failed) return null;

  return (
    <div
      role="group"
      aria-labelledby={id}
      className="border-border mt-3 space-y-0.5 border-t pt-3"
    >
      <SectionLabel as="h2" id={id} bordered={false} className="px-3 pb-1">
        {title}
      </SectionLabel>
      {pending ? (
        <div
          role="status"
          aria-label={t("loading")}
          className="space-y-1 px-3 py-1"
        >
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-7 w-3/5" />
        </div>
      ) : null}
      {failed ? (
        <div role="status" className="px-3 text-sm">
          <p>{t("errorTitle")}</p>
          <button
            type="button"
            onClick={retry}
            className="focus-visible:ring-ring min-h-11 underline focus-visible:ring-2"
          >
            {t("retry")}
          </button>
        </div>
      ) : null}
      {items.map((item) => (
        <ShellNavLink
          key={item.href}
          item={item}
          active={active?.href === item.href}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

export function CommunityShell({
  community,
  membershipStatus,
  memberRole,
  user,
  memberships,
  retryMemberships,
  showCover,
  children,
}: CommunityShellProps) {
  const t = useTranslations("redesign.shell");
  const profile = useTranslations("communities.profile");
  const nav = useTranslations("nav");
  const pathname = usePathname();
  const { account, groups: hubGroups } = useHubNavigation(!!user);
  const canRead = community.viewerCanReadContent;
  const member = membershipStatus === "active";
  const {
    home,
    spaces,
    rooms,
    referrals,
    manage,
    spacesPending,
    roomsPending,
    spacesError,
    roomsError,
    refetchSpaces,
    refetchRooms,
  } = useCommunityNavigation({
    slug: community.slug,
    memberRole,
    allowed: canRead,
    signedIn: !!user,
    redesign: true,
  });

  const unread = useRoomUnread(
    community.slug,
    rooms.filter((room) => room.membership === "active").map((room) => room.id),
    !!user && !!memberRole && canRead,
  );
  const roomLinks = rooms.map((room) => ({
    ...room,
    unread: unread.get(room.id),
  }));
  const destinations = [home, ...spaces, ...roomLinks, ...referrals, ...manage];
  const active = activeDestination(pathname, destinations);
  const homeActive = active === home;
  const firstSegment = pathname.slice(home.href.length).split("/")[1];
  const sectionLabels = {
    match: profile("matching"),
    launchpad: profile("launchpad"),
    magazine: profile("magazine"),
    classroom: profile("classroom"),
    members: profile("members"),
    spaces: t("rooms"),
  } as Record<string, string>;
  const section =
    active?.label ??
    (firstSegment === "offers" ? profile("offers") : undefined) ??
    (canRead ? sectionLabels[firstSegment ?? ""] : undefined) ??
    t("communityPage");
  const identity = { community, membershipStatus, memberRole, compact: true };
  const switcher = {
    memberships,
    retryMemberships,
    signedIn: !!user,
    activeSlug: community.slug,
  };

  function renderRail(onNavigate?: () => void) {
    return (
      <>
        <div className="border-border space-y-3 border-b p-3 lg:p-4">
          {member || !onNavigate ? (
            <CommunityIdentity {...identity} secondaryHeading={!!onNavigate} />
          ) : null}
          <CommunitySwitcher {...switcher} onNavigate={onNavigate} />
        </div>
        <nav aria-label={t("communityNavigation")} className="p-3">
          <ShellNavLink
            item={home}
            active={homeActive}
            onNavigate={onNavigate}
          />
          <SpaceGroup
            title={t("spaces")}
            items={spaces}
            active={active}
            pending={spacesPending}
            failed={spacesError}
            retry={() => void refetchSpaces()}
            onNavigate={onNavigate}
          />
          <SpaceGroup
            title={t("rooms")}
            items={roomLinks}
            active={active}
            pending={roomsPending}
            failed={roomsError}
            retry={() => void refetchRooms()}
            onNavigate={onNavigate}
          />
          {referrals.map((item) => (
            <ShellNavLink
              key={item.href}
              item={item}
              active={active === item}
              onNavigate={onNavigate}
            />
          ))}
          <SpaceGroup
            title={profile("manageGroup")}
            items={manage}
            active={active}
            onNavigate={onNavigate}
          />
        </nav>
      </>
    );
  }

  return (
    <CommunityThemePreviewProvider>
      <CommunityThemeScope themeId={community.themeId} className="min-h-svh">
        <div
          data-community-shell=""
          className="pb-(--community-mobile-bar-height) lg:pb-0"
        >
          <ShellHeader
            location={community.name}
            section={section}
            destinations={[...destinations, ...account]}
            account={account}
            user={user}
            community
            leading={
              <>
                <div className="shrink-0 lg:hidden">
                  <CommunitySwitcher {...switcher} compact />
                </div>
                <Link
                  href="/"
                  aria-label={t("hub")}
                  title={t("hub")}
                  className="hover:bg-secondary focus-visible:ring-ring hidden min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-inset lg:flex"
                >
                  <AitLogo className="h-4 w-auto" aria-hidden />
                </Link>
              </>
            }
          />
          <div className="grid min-h-[calc(100svh-3rem-1px)] grid-cols-1 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
            <aside
              data-community-rail=""
              className="border-border bg-muted/25 hidden lg:sticky lg:top-[calc(3rem+1px)] lg:block lg:h-[calc(100dvh-3rem-1px)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:[scrollbar-width:thin]"
            >
              {renderRail()}
            </aside>
            <div
              id="shell-content"
              tabIndex={-1}
              className="min-w-0 scroll-mt-14 px-4 py-4 focus:outline-none sm:px-6 lg:px-8 lg:py-6"
            >
              {member ? (
                <h1 className="sr-only lg:hidden">{community.name}</h1>
              ) : (
                <div className="mb-4 lg:hidden">
                  <CommunityIdentity {...identity} />
                </div>
              )}
              {showCover ? (
                <CommunityThemeCover
                  community={community}
                  className="mb-5 lg:mb-6"
                />
              ) : null}
              {children}
            </div>
          </div>
          <nav
            aria-label={t("mobileNavigation")}
            className="border-border bg-background fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-1 border-t px-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
          >
            <Link
              href={home.href}
              aria-current={homeActive ? "page" : undefined}
              className={cn(
                bottomLinkClass,
                homeActive && "bg-secondary font-semibold",
              )}
            >
              <MobileLabel icon={House} label={home.label} />
            </Link>
            <ShellDrawer
              title={t("spaces")}
              trigger={
                <button
                  type="button"
                  className={cn(
                    bottomLinkClass,
                    !homeActive && "bg-secondary font-semibold",
                  )}
                  aria-label={
                    !homeActive ? t("spacesCurrent", { section }) : undefined
                  }
                >
                  <MobileLabel icon={PanelLeft} label={t("spaces")} />
                </button>
              }
            >
              {renderRail}
            </ShellDrawer>
            <MessagesNavLink presentation="bottom" signedIn={!!user} />
            <ShellDrawer
              side="right"
              title={nav("more")}
              trigger={
                <Button
                  variant="ghost"
                  className={cn(bottomLinkClass, "h-auto whitespace-normal")}
                >
                  <MobileLabel icon={Ellipsis} label={nav("more")} />
                </Button>
              }
            >
              {(close) => (
                <ShellNavGroups groups={hubGroups} onNavigate={close} />
              )}
            </ShellDrawer>
          </nav>
        </div>
      </CommunityThemeScope>
    </CommunityThemePreviewProvider>
  );
}
