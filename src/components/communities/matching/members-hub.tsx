"use client";

import { useCallback, useDeferredValue, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, type RouterOutputs } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DirectoryMemberRow } from "./directory-member-row";
import { MatchingProfileForm } from "./profile-form";
import { CommunityMatches } from "./matches";
import { IntroductionHistory } from "./introduction-history";
import {
  MEMBERS_HUB_TABS,
  canOpenMembersHubTab,
  isMembersHubTab,
  parseMembersHubTab,
  writeMembersHubTab,
  type MembersHubTab,
} from "./members-hub-tab";

export function MemberDirectory({ slug }: { slug: string }) {
  const t = useTranslations("communityMatching");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const query = api.communities.getMembers.useInfiniteQuery(
    { slug, limit: 50, q },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="space-y-5">
      <div className="max-w-md space-y-2">
        <Label htmlFor="member-search">{t("searchMembers")}</Label>
        <Input
          id="member-search"
          type="search"
          maxLength={100}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchByNameOrBio")}
        />
      </div>
      {query.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : query.isError ? (
        <ErrorState onRetry={query.refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t("noMembers")}
          description={t("noMembersDescription")}
        />
      ) : (
        <ul className="divide-y border-y">
          {items.map((member) => (
            <DirectoryMemberRow key={member.userId} member={member} />
          ))}
        </ul>
      )}
      {query.isFetchNextPageError && (
        <p role="alert" className="text-destructive text-sm">
          {t("loadMoreFailed")}
        </p>
      )}
      {query.hasNextPage && (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t("loadMore")}
        </Button>
      )}
    </div>
  );
}

const TAB_LABEL_KEYS = {
  directory: "peopleTab",
  matches: "matchesTab",
  profile: "profileTab",
  introductions: "introductionsTab",
} as const satisfies Record<MembersHubTab, string>;

/**
 * The open tab, kept in the URL in place (history.replaceState, which Next
 * syncs into `useSearchParams`): a tab can be shared and survives refresh,
 * and Back leaves the page instead of stepping through every tab.
 */
function useMembersHubTab(canManage: boolean) {
  const searchParams = useSearchParams();
  const tab = parseMembersHubTab(searchParams, canManage);
  const setTab = useCallback((value: string) => {
    if (!isMembersHubTab(value)) return;
    const url = new URL(window.location.href);
    const next = writeMembersHubTab(url.searchParams, value).toString();
    window.history.replaceState(
      null,
      "",
      next ? `${url.pathname}?${next}` : url.pathname,
    );
  }, []);
  return [tab, setTab] as const;
}

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
  const [tab, setTab] = useMembersHubTab(canManage);
  const tabs = MEMBERS_HUB_TABS.filter((each) =>
    canOpenMembersHubTab(each, canManage),
  );
  const panels: Record<MembersHubTab, ReactNode> = {
    directory: <MemberDirectory slug={slug} />,
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
  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-6">
      <div className="overflow-x-auto pb-1">
        <TabsList variant="line" aria-label={t("navigation")}>
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

export function CommunityMembersHub({ slug }: { slug: string }) {
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
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-2 max-w-prose text-sm">
          {t("description")}
        </p>
      </div>
      {session?.user && memberships.isPending ? (
        <Skeleton className="h-40" />
      ) : memberships.isError && session?.user ? (
        <ErrorState onRetry={memberships.refetch} />
      ) : active ? (
        <MatchingWorkspace slug={slug} />
      ) : (
        <MemberDirectory slug={slug} />
      )}
    </div>
  );
}
