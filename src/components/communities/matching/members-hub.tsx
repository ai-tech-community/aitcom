"use client";

import { useDeferredValue, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DirectoryMemberRow } from "./directory-member-row";

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

/**
 * The People page: the member directory, for everyone who may read the
 * community. Matching lives on its own page (`FindAMatch`).
 */
export function CommunityMembersHub({ slug }: { slug: string }) {
  const t = useTranslations("communityMatching");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-2 max-w-prose text-sm">
          {t("description")}
        </p>
      </div>
      <MemberDirectory slug={slug} />
    </div>
  );
}
