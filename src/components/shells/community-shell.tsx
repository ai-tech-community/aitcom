"use client";

import { useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Compass, Ellipsis, House, PanelLeft, UserRound } from "lucide-react";
import { AitLogo } from "@/components/ait-logo";
import type { CommunityIdentity } from "@/components/communities/community-identity";
import { CommunityActionsMenu } from "@/components/communities/community-actions-menu";
import { JoinButton } from "@/components/communities/join-button";
import {
  OnboardingReminderProvider,
  OnboardingReminderRow,
} from "@/components/onboarding/onboarding-reminder";
import { useCommunityNavigation } from "@/components/communities/community-navigation";
import { CommunityThemeCover } from "@/components/communities/theme/community-theme-cover";
import { CommunityThemePreviewProvider } from "@/components/communities/theme/community-theme-preview";
import { CommunityThemeScope } from "@/components/communities/theme/community-theme-scope";
import { MessagesNavLink } from "@/components/inbox/messages-nav-link";
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
import {
  ShellDrawer,
  ShellNavGroups,
  ShellNavLink,
  ShellMobileNav,
  ShellMobileLabel,
  shellMobileButton,
  shellActiveTab,
} from "./shell-navigation";
import { ShellUnreadBadge } from "./unread-badge";
import { useRoomUnread } from "./use-room-unread";

type CommunityShellProps = React.ComponentProps<typeof CommunityIdentity> & {
  user: HubAuthUser | null;
  memberships: readonly HubMembershipSeed[];
  retryMemberships?: () => void;
  showCover: boolean;
  children: ReactNode;
};

function SpaceGroup({
  title,
  headingHidden = false,
  items,
  active,
  pending,
  failed,
  retry,
  onNavigate,
}: {
  title: string;
  headingHidden?: boolean;
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
      <SectionLabel
        as="h2"
        id={id}
        bordered={false}
        className={headingHidden ? "sr-only" : "px-3 pb-1"}
      >
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
          className="min-h-12 lg:min-h-9"
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
  const roles = useTranslations("communities.roles");
  const nav = useTranslations("nav");
  const pathname = usePathname();
  const { account, groups: hubGroups } = useHubNavigation(!!user);
  const desktopIdentity = useRef<HTMLButtonElement>(null);
  const mobileIdentity = useRef<HTMLButtonElement>(null);
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

  const readingRoom = rooms.find(
    (room) => room.href === pathname && room.membership === "active",
  );
  const unread = useRoomUnread(
    community.slug,
    rooms.filter((room) => room.membership === "active").map((room) => room.id),
    !!user && !!memberRole && canRead,
    readingRoom?.id,
  );
  const total = [...unread.values()].reduce(
    (count, roomUnread) => count + roomUnread,
    0,
  );
  const roomLinks = rooms.map((room) => ({
    ...room,
    unread: unread.get(room.id),
  }));
  const places = [...spaces, ...roomLinks];
  const destinations = [home, ...places, ...manage];
  const active = activeDestination(pathname, destinations);
  const invite = referrals[0];
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
    (invite?.href === pathname ? invite.label : undefined) ??
    (firstSegment === "offers" ? profile("offers") : undefined) ??
    (canRead ? sectionLabels[firstSegment ?? ""] : undefined) ??
    t("communityPage");
  const identity = { name: community.name, logoUrl: community.logoUrl ?? null };
  const membership = {
    slug: community.slug,
    name: community.name,
    joinPolicy: community.joinPolicy,
    membershipStatus,
    memberRole,
  };

  function communitySwitcher(compact = false, onNavigate?: () => void) {
    return (
      <CommunitySwitcher
        identity={identity}
        triggerRef={
          onNavigate ? undefined : compact ? mobileIdentity : desktopIdentity
        }
        compact={compact}
        context={compact ? section : undefined}
        memberships={memberships}
        retryMemberships={retryMemberships}
        signedIn={!!user}
        activeSlug={community.slug}
        onNavigate={onNavigate}
        details={
          member && memberRole
            ? (close) => (
                <>
                  <p className="text-muted-foreground px-3 py-2 text-sm">
                    {t("yourRole", { role: roles(memberRole) })}
                  </p>
                  <CommunityActionsMenu
                    {...membership}
                    returnFocusAfterLeave={() =>
                      (compact || onNavigate ? mobileIdentity : desktopIdentity)
                        .current
                    }
                    onRowAction={() => {
                      close();
                      onNavigate?.();
                    }}
                  />
                </>
              )
            : undefined
        }
      />
    );
  }

  function renderRail(onNavigate?: () => void) {
    const Heading = onNavigate ? "div" : "h1";
    return (
      <>
        <div className="border-border space-y-2 border-b px-3 py-2">
          <Heading>{communitySwitcher(false, onNavigate)}</Heading>
          {!member && !onNavigate ? (
            <JoinButton {...membership} focusAfterChange={desktopIdentity} />
          ) : null}
        </div>
        <nav aria-label={t("communityNavigation")} className="space-y-1 p-3">
          {user && !onNavigate ? <OnboardingReminderRow /> : null}
          <ShellNavLink
            item={home}
            active={homeActive}
            onNavigate={onNavigate}
            className="min-h-12 lg:min-h-9"
          />
          <SpaceGroup
            title={t("spaces")}
            headingHidden={!!onNavigate}
            items={places}
            active={active}
            pending={spacesPending || roomsPending}
            failed={spacesError || roomsError}
            retry={() => {
              if (spacesError) void refetchSpaces();
              if (roomsError) void refetchRooms();
            }}
            onNavigate={onNavigate}
          />
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

  function inviteAction(onNavigate?: () => void) {
    return invite ? (
      <ShellNavLink
        item={invite}
        active={pathname === invite.href}
        onNavigate={onNavigate}
        className="border-border border"
      />
    ) : null;
  }

  const spacesLabel = homeActive
    ? t("spaces")
    : t("spacesCurrent", { section });

  return (
    <CommunityThemePreviewProvider>
      <CommunityThemeScope themeId={community.themeId} className="min-h-svh">
        <OnboardingReminderProvider enabled={!!user}>
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
              mobileLocation={communitySwitcher(true)}
              leading={
                <Link
                  href="/"
                  aria-label={t("hub")}
                  title={t("hub")}
                  className="hover:bg-secondary focus-visible:ring-ring hidden min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-inset lg:flex"
                >
                  <AitLogo className="h-4 w-auto" aria-hidden />
                </Link>
              }
            />
            <div className="grid min-h-[calc(100svh-3rem-1px)] grid-cols-1 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
              <aside
                data-community-rail=""
                className="border-border bg-muted/25 hidden lg:sticky lg:top-[calc(3rem+1px)] lg:flex lg:h-[calc(100dvh-3rem-1px)] lg:flex-col lg:self-start lg:border-r"
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
                  {renderRail()}
                </div>
                {invite ? (
                  <div className="border-border shrink-0 border-t p-3">
                    {inviteAction()}
                  </div>
                ) : null}
              </aside>
              <div
                id="shell-content"
                tabIndex={-1}
                className="min-w-0 scroll-mt-14 px-4 py-4 focus:outline-none sm:px-6 lg:px-8 lg:py-6"
              >
                <h1 className="sr-only lg:hidden">{community.name}</h1>
                {!member ? (
                  <div className="mb-4 lg:hidden [&_button]:min-h-11">
                    <JoinButton
                      {...membership}
                      focusAfterChange={mobileIdentity}
                    />
                  </div>
                ) : null}
                {showCover ? (
                  <CommunityThemeCover
                    community={community}
                    className="mb-5 lg:mb-6"
                  />
                ) : null}
                {children}
              </div>
            </div>
            <ShellMobileNav label={t("mobileNavigation")}>
              <Link
                href={home.href}
                aria-current={homeActive ? "page" : undefined}
                className={cn(shellMobileButton, homeActive && shellActiveTab)}
              >
                <ShellMobileLabel icon={House} label={home.label} />
              </Link>
              <ShellDrawer
                title={t("spaces")}
                footer={(close) => (
                  <>
                    {inviteAction(close)}
                    <ShellNavLink
                      item={
                        user
                          ? {
                              href: "/dashboard",
                              label: t("account"),
                              icon: UserRound,
                            }
                          : {
                              href: "/communities",
                              label: t("discover"),
                              icon: Compass,
                            }
                      }
                      onNavigate={close}
                    />
                  </>
                )}
                trigger={
                  <button
                    type="button"
                    className={cn(
                      shellMobileButton,
                      !homeActive && shellActiveTab,
                    )}
                    aria-label={
                      total
                        ? `${spacesLabel}, ${t("unread", { count: total })}`
                        : spacesLabel
                    }
                  >
                    <ShellMobileLabel
                      icon={PanelLeft}
                      label={t("spaces")}
                      badge={<ShellUnreadBadge count={total} />}
                    />
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
                  <button type="button" className={shellMobileButton}>
                    <ShellMobileLabel icon={Ellipsis} label={nav("more")} />
                  </button>
                }
              >
                {(close) => (
                  <ShellNavGroups groups={hubGroups} onNavigate={close}>
                    {user ? <OnboardingReminderRow /> : null}
                  </ShellNavGroups>
                )}
              </ShellDrawer>
            </ShellMobileNav>
          </div>
        </OnboardingReminderProvider>
      </CommunityThemeScope>
    </CommunityThemePreviewProvider>
  );
}
