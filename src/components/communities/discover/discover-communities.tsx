"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Button } from "@/components/ui/button";
import { CommunityCard } from "./community-card";
import { QUIET_SQUARE } from "./ascii-art";

export type Facet = "trending" | "newest" | "largest";

function RowsSkeleton() {
  return (
    <ul className="border-border divide-border/60 mt-3 divide-y overflow-hidden rounded-lg border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="size-9 shrink-0 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-16 shrink-0 rounded-md" />
        </li>
      ))}
    </ul>
  );
}

export function DiscoverCommunities({
  facet,
  search,
}: {
  facet: Facet;
  search: string;
}) {
  const t = useTranslations("communities.discover");
  const searching = search.trim().length > 0;
  // Trending shelf only when not searching and facet is trending.
  const useTrending = !searching && facet === "trending";

  const trendingQ = api.communities.trending.useQuery(
    { limit: 24 },
    { enabled: useTrending },
  );
  const listQ = api.communities.list.useInfiniteQuery(
    {
      search: search || undefined,
      limit: 20,
      sort: facet === "largest" && !searching ? "largest" : "newest",
    },
    {
      enabled: !useTrending,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    },
  );

  const Header = <SectionLabel as="h2">{t("communities")}</SectionLabel>;

  if (useTrending) {
    if (trendingQ.isLoading)
      return (
        <section>
          {Header}
          <RowsSkeleton />
        </section>
      );
    if (trendingQ.isError)
      return (
        <section>
          {Header}
          <div className="mt-3">
            <ErrorState onRetry={() => void trendingQ.refetch()} />
          </div>
        </section>
      );
    const items = trendingQ.data?.items ?? [];
    return (
      <section>
        {Header}
        {items.length === 0 ? (
          <div className="mt-3 flex flex-col items-start gap-2">
            <pre
              aria-hidden="true"
              className="text-muted-foreground overflow-x-auto font-mono text-[10px] leading-tight"
            >
              {QUIET_SQUARE}
            </pre>
            <p className="text-muted-foreground text-sm">
              {t("emptyCommunities")}
            </p>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => (
              <CommunityCard
                key={c.id}
                slug={c.slug}
                name={c.name}
                description={c.description}
                logoUrl={c.logoUrl}
                memberCount={c.memberCount}
                faces={c.faces}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  if (listQ.isLoading)
    return (
      <section>
        {Header}
        <RowsSkeleton />
      </section>
    );
  if (listQ.isError)
    return (
      <section>
        {Header}
        <div className="mt-3">
          <ErrorState onRetry={() => void listQ.refetch()} />
        </div>
      </section>
    );
  const items = listQ.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section>
      <SectionLabel as="h2">
        {t("communities")} · {items.length}
      </SectionLabel>
      {items.length === 0 ? (
        <div className="mt-3 flex flex-col items-start gap-2">
          <pre
            aria-hidden="true"
            className="text-muted-foreground overflow-x-auto font-mono text-[10px] leading-tight"
          >
            {QUIET_SQUARE}
          </pre>
          <p className="text-muted-foreground text-sm">
            {t("emptyCommunities")}
          </p>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <CommunityCard
              key={c.id}
              slug={c.slug}
              name={c.name}
              description={c.description}
              logoUrl={c.logoUrl}
              memberCount={c.memberCount}
              faces={c.faces}
            />
          ))}
        </div>
      )}
      {listQ.hasNextPage ? (
        <div className="mt-3 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={listQ.isFetchingNextPage}
            onClick={() => void listQ.fetchNextPage()}
          >
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
