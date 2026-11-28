"use client";

import { ArrowUpRight, Ellipsis } from "lucide-react";
import { useTranslations } from "next-intl";
import { useInitialAuthUser } from "@/components/auth/session-provider";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { authClient } from "@/server/better-auth/client";
import {
  documentAuthUser,
  type HubAuthUser,
  type HubMembershipSeed,
} from "@/server/better-auth/hub-session";
import { api } from "@/trpc/react";
import {
  OnboardingReminderProvider,
  OnboardingReminderRow,
} from "@/components/onboarding/onboarding-reminder";
import { MessagesNavLink } from "@/components/inbox/messages-nav-link";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import type { BuiltinSurface } from "@/server/communities/space-defaults";
import { CommunitySwitcher, usableMemberships } from "./community-switcher";
import { useHubNavigation } from "./hub-navigation";
import { activeDestination, type ShellDestination } from "./navigation";
import { ShellHeader } from "./shell-header";
import {
  shellIconButton,
  shellActiveTab,
  shellMobileButton,
  ShellMobileNav,
  ShellMobileLabel,
  ShellDrawer,
  ShellNavGroups,
  ShellNavLink,
} from "./shell-navigation";

const localSurfaces: Partial<Record<string, BuiltinSurface>> = {
  "/events": "events",
  "/forum": "forum",
  "/ideas": "ideas",
  "/magazines": "magazine",
  "/members": "members",
};

function CommunityCounterparts({
  memberships,
  surface,
  onNavigate,
}: {
  memberships: readonly HubMembershipSeed[];
  surface: BuiltinSurface | "launchpad";
  onNavigate: () => void;
}) {
  const t = useTranslations("redesign.shell");
  const common = useTranslations("common");
  const rooms = api.useQueries((queries) =>
    surface === "launchpad"
      ? []
      : memberships.map(({ slug }) => queries.spaces.list({ slug })),
  );
  const items = memberships.flatMap((membership, index) => {
    const query = rooms[index];
    const local =
      surface === "launchpad"
        ? "launchpad"
        : !query?.isError
          ? query?.data?.find((item) => item.builtinSurface === surface)?.slug
          : undefined;

    return local
      ? [
          {
            href: `/communities/${membership.slug}/${local}`,
            label: membership.name ?? membership.slug,
            icon: ArrowUpRight,
          },
        ]
      : [];
  });
  const pending = rooms.some((query) => query.isPending);
  if (!pending && !items.length) return null;

  return (
    <div className="border-border mb-5 space-y-1 border-b pb-4">
      <SectionLabel as="h3" bordered={false} className="px-3 pb-1">
        {t("inYourCommunities")}
      </SectionLabel>
      {items.map((item) => (
        <ShellNavLink key={item.href} item={item} onNavigate={onNavigate} />
      ))}
      {pending ? (
        <div role="status" aria-label={common("loading")} className="px-3 py-2">
          <Skeleton className="h-7 w-2/3" />
        </div>
      ) : null}
    </div>
  );
}

export function HubShellHeader({
  initialUser,
  initialMemberships,
}: {
  initialUser: HubAuthUser | null;
  initialMemberships: readonly HubMembershipSeed[];
}) {
  const t = useTranslations("redesign.shell");
  const legal = useTranslations("footer");
  const nav = useTranslations("nav");
  const auth = useTranslations("auth");
  const pathname = usePathname();
  const publishedUser = useInitialAuthUser();
  const { data: session } = authClient.useSession();
  const user = documentAuthUser(initialUser, publishedUser, session?.user);
  const membershipQuery = api.communities.getMyCommunities.useQuery(undefined, {
    enabled: !!user,
  });
  const memberships = membershipQuery.isError
    ? []
    : (membershipQuery.data ?? initialMemberships);
  const usable = user ? usableMemberships(memberships) : [];
  const { main, account, groups } = useHubNavigation(!!user);
  const destinations = groups.flatMap((group) => group.items);
  const active = activeDestination(pathname, destinations);
  const primaryActive = active && main.includes(active);
  const counterpart =
    active?.href === "/launchpad"
      ? "launchpad"
      : localSurfaces[active?.href ?? ""];
  const contextualDestinations: ShellDestination[] = [
    { href: "/messages", label: nav("messages") },
    { href: "/privacy", label: legal("privacy") },
    { href: "/security", label: legal("security") },
    { href: "/terms", label: legal("terms") },
    { href: "/auth/signin", label: auth("signIn") },
    { href: "/auth/signup", label: auth("signUp") },
    { href: "/auth/forgot-password", label: auth("forgotPasswordTitle") },
    { href: "/auth/reset-password", label: auth("resetPasswordTitle") },
    { href: "/guides", label: t("guides") },
    { href: "/setup", label: t("setup") },
    { href: "/join", label: t("join") },
    { href: "/invite", label: t("join") },
  ];
  const section =
    active?.label ?? activeDestination(pathname, contextualDestinations)?.label;
  const membershipHomes = usable.map((membership) => ({
    href: `/communities/${membership.slug}`,
    label: membership.name ?? membership.slug,
  }));

  function more(close: () => void) {
    return (
      <>
        {counterpart && usable.length > 0 ? (
          <CommunityCounterparts
            memberships={usable}
            surface={counterpart}
            onNavigate={close}
          />
        ) : null}
        <ShellNavGroups groups={groups} onNavigate={close}>
          {user ? <OnboardingReminderRow /> : null}
        </ShellNavGroups>
      </>
    );
  }

  return (
    <OnboardingReminderProvider enabled={!!user}>
      <ShellHeader
        location={t("hub")}
        section={section}
        sectionInNavigation={primaryActive}
        user={user}
        destinations={[...destinations, ...membershipHomes]}
        account={account}
        leading={
          <CommunitySwitcher
            compact
            signedIn={!!user}
            memberships={memberships}
            retryMemberships={
              membershipQuery.isError
                ? () => void membershipQuery.refetch()
                : undefined
            }
          />
        }
        navigation={
          <nav
            className="hidden shrink-0 items-center gap-0.5 lg:flex xl:gap-1"
            aria-label={t("hubNavigation")}
          >
            {main.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active === item ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring inline-flex min-h-9 items-center rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-2 xl:px-3",
                  active === item
                    ? "bg-secondary text-foreground decoration-foreground/60 font-semibold underline underline-offset-4"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        }
        trailing={
          <ShellDrawer
            side="right"
            title={t("hubNavigation")}
            trigger={
              <button
                type="button"
                className={cn(shellIconButton, "hidden lg:inline-flex")}
                aria-label={t("hubNavigation")}
                title={t("hubNavigation")}
              >
                <Ellipsis className="size-5" aria-hidden />
              </button>
            }
          >
            {more}
          </ShellDrawer>
        }
      />
      <ShellMobileNav label={t("hubNavigation")}>
        {main.slice(0, 2).map((item) =>
          item.icon ? (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active === item ? "page" : undefined}
              className={cn(
                shellMobileButton,
                active === item && shellActiveTab,
              )}
            >
              <ShellMobileLabel icon={item.icon} label={item.label} />
            </Link>
          ) : null,
        )}
        <MessagesNavLink presentation="bottom" signedIn={!!user} />
        <ShellDrawer
          side="right"
          title={t("hubNavigation")}
          trigger={
            <button type="button" className={shellMobileButton}>
              <ShellMobileLabel icon={Ellipsis} label={nav("more")} />
            </button>
          }
        >
          {more}
        </ShellDrawer>
      </ShellMobileNav>
    </OnboardingReminderProvider>
  );
}
