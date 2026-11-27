"use client";

import { useCallback, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, type RouterOutputs } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchingProfileForm } from "./profile-form";
import { CommunityMatches } from "./matches";
import { IntroductionHistory } from "./introduction-history";
import {
  MATCHING_TABS,
  canOpenMatchingTab,
  isMatchingTab,
  parseMatchingTab,
  writeMatchingTab,
  type MatchingTab,
} from "./find-a-match-tab";

const TAB_LABEL_KEYS = {
  matches: "matchesTab",
  profile: "profileTab",
  introductions: "introductionsTab",
} as const satisfies Record<MatchingTab, string>;

/**
 * The open tab, kept in the URL in place (history.replaceState, which Next
 * syncs into `useSearchParams`): a tab can be shared and survives refresh,
 * and Back leaves the page instead of stepping through every tab.
 */
function useMatchingTab(canManage: boolean) {
  const searchParams = useSearchParams();
  const tab = parseMatchingTab(searchParams, canManage);
  const setTab = useCallback(
    (value: string) => {
      if (!isMatchingTab(value)) return;
      const url = new URL(window.location.href);
      const next = writeMatchingTab(
        url.searchParams,
        value,
        canManage,
      ).toString();
      window.history.replaceState(
        null,
        "",
        next ? `${url.pathname}?${next}` : url.pathname,
      );
    },
    [canManage],
  );
  return [tab, setTab] as const;
}

/** Loads matching for an active member; `setup` is a member-only procedure. */
function MatchingWorkspace({ slug }: { slug: string }) {
  const setup = api.communityMatching.setup.useQuery({ slug });
  if (setup.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-9" />
        <Skeleton className="h-40" />
      </div>
    );
  if (setup.isError) return <ErrorState onRetry={setup.refetch} />;
  return <MatchingTabs slug={slug} {...setup.data} />;
}

function MatchingTabs({
  slug,
  types,
  profile,
  canManage,
}: { slug: string } & RouterOutputs["communityMatching"]["setup"]) {
  const t = useTranslations("communityMatching");
  const [tab, setTab] = useMatchingTab(canManage);
  const tabs = MATCHING_TABS.filter((each) =>
    canOpenMatchingTab(each, canManage),
  );
  const panels: Record<MatchingTab, ReactNode> = {
    matches: <CommunityMatches slug={slug} types={types} />,
    profile: (
      <MatchingProfileForm
        key={JSON.stringify({ types, profile })}
        slug={slug}
        profile={profile}
        types={types}
      />
    ),
    introductions: <IntroductionHistory slug={slug} />,
  };
  // A strip with a single tab names nothing to choose between.
  if (tabs.length === 1) return panels[tab];
  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-6">
      <div className="overflow-x-auto pb-1">
        <TabsList variant="line" aria-label={t("findTitle")}>
          {tabs.map((each) => (
            <TabsTrigger key={each} value={each}>
              {t(TAB_LABEL_KEYS[each])}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((each) => (
        <TabsContent key={each} value={each}>
          {panels[each]}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/**
 * The Find a match page: Matches and Introductions for owners and admins,
 * My matching profile for every active member. Anyone else (signed out,
 * pending, inactive) is asked to join and matching is never loaded for them.
 */
export function FindAMatch({ slug }: { slug: string }) {
  const t = useTranslations("communityMatching");
  const { data: session } = authClient.useSession();
  const memberships = api.communities.getMyCommunities.useQuery(undefined, {
    enabled: !!session?.user,
  });
  const active =
    !!session?.user &&
    memberships.data?.some(
      (member) => member.slug === slug && member.status === "active",
    );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("findTitle")}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-prose text-sm">
          {t("findDescription")}
        </p>
      </div>
      {session?.user && memberships.isPending ? (
        <Skeleton className="h-40" />
      ) : memberships.isError && session?.user ? (
        <ErrorState onRetry={memberships.refetch} />
      ) : active ? (
        <MatchingWorkspace slug={slug} />
      ) : (
        <EmptyState
          title={t("joinToMatch")}
          description={t("joinToMatchDescription")}
        />
      )}
    </div>
  );
}
