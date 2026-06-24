"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Button } from "@/components/ui/button";
import { SpaceCard } from "./space-card";
import { QUIET_SQUARE } from "./ascii-art";

export function DiscoverSpaces({ search }: { search: string }) {
  const t = useTranslations("communities.discover");
  const q = api.spaces.discoverPublic.useInfiniteQuery(
    { search: search || undefined, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  if (q.isLoading) {
    return (
      <section className="mt-10">
        <SectionLabel as="h2">{t("spaces")}</SectionLabel>
        <ul className="border-border divide-border/60 mt-3 divide-y overflow-hidden rounded-lg border">
          {[0, 1].map((i) => (
            <li key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="size-9 shrink-0 rounded-md" />
              <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
              <Skeleton className="h-8 w-16 shrink-0 rounded-md" />
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (q.isError) return <div className="mt-10"><ErrorState onRetry={() => void q.refetch()} /></div>;

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (items.length === 0) {
    return (
      <section className="mt-10">
        <SectionLabel as="h2">{t("spaces")}</SectionLabel>
        <div className="mt-3 flex flex-col items-start gap-2">
          <pre
            aria-hidden="true"
            className="text-muted-foreground overflow-x-auto font-mono text-[10px] leading-tight"
          >
            {QUIET_SQUARE}
          </pre>
          <p className="text-muted-foreground text-sm">{t("emptySpaces")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <SectionLabel as="h2">{t("spaces")} · {items.length}</SectionLabel>
      <p className="text-muted-foreground mt-1 font-mono text-xs">{t("spacesSub")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((s) => (
          <SpaceCard
            key={s.spaceId}
            spaceName={s.spaceName}
            spaceSlug={s.spaceSlug}
            communityName={s.communityName}
            communitySlug={s.communitySlug}
            memberCount={s.memberCount}
          />
        ))}
      </div>
      {q.hasNextPage ? (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
