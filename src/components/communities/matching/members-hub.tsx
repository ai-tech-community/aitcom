"use client";

import { useDeferredValue, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemberIdentity } from "./member-identity";
import { MatchingProfileForm } from "./profile-form";
import { CommunityMatches } from "./matches";
import { IntroductionHistory } from "./introduction-history";

export function MemberDirectory({ slug }: { slug: string }) {
  const t = useTranslations("communityMatching");
  const roles = useTranslations("communities.roles");
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
            <li
              key={member.userId}
              className="flex items-start justify-between gap-4 py-4"
            >
              <div className="min-w-0">
                <MemberIdentity
                  member={member}
                  fallback={t("memberFallback")}
                />
                {member.bio && (
                  <p className="text-muted-foreground mt-2 max-w-prose text-sm break-words">
                    {member.bio}
                  </p>
                )}
              </div>
              {member.role !== "member" && (
                <Badge variant="secondary">{roles(member.role)}</Badge>
              )}
            </li>
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

function MatchingWorkspace({ slug }: { slug: string }) {
  const t = useTranslations("communityMatching");
  const [tab, setTab] = useState("people");
  const setup = api.communityMatching.setup.useQuery({ slug });
  if (setup.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-9" />
        <Skeleton className="h-40" />
      </div>
    );
  if (setup.isError) return <ErrorState onRetry={setup.refetch} />;
  const { types, profile, canManage } = setup.data;
  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-6">
      <div className="overflow-x-auto pb-1">
        <TabsList variant="line" aria-label={t("navigation")}>
          <TabsTrigger value="people">{t("peopleTab")}</TabsTrigger>
          {canManage && (
            <TabsTrigger value="matches">{t("matchesTab")}</TabsTrigger>
          )}
          <TabsTrigger value="profile">{t("profileTab")}</TabsTrigger>
          {canManage && (
            <>
              <TabsTrigger value="introductions">
                {t("introductionsTab")}
              </TabsTrigger>
            </>
          )}
        </TabsList>
      </div>
      <TabsContent value="people">
        <MemberDirectory slug={slug} />
      </TabsContent>
      <TabsContent value="profile">
        <MatchingProfileForm
          key={JSON.stringify({ types, profile })}
          slug={slug}
          profile={profile}
          types={types}
        />
      </TabsContent>
      {canManage && (
        <>
          <TabsContent value="matches">
            <CommunityMatches slug={slug} types={types} />
          </TabsContent>
          <TabsContent value="introductions">
            <IntroductionHistory slug={slug} />
          </TabsContent>
        </>
      )}
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
