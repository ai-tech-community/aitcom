"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Button } from "@/components/ui/button";
import { SpaceCard } from "./space-card";

/**
 * Fewest public rooms before the section shows while browsing. Below it
 * the rooms live on their communities' pages only, so a thin list never
 * becomes the end of the directory. A search always shows its matches.
 */
export const MIN_BROWSE_ROOMS = 3;

/** Public rooms across listed communities. */
export function DiscoverSpaces({
  search,
  className,
}: {
  search: string;
  className?: string;
}) {
  const t = useTranslations("communities.discover");
  const q = api.spaces.discoverPublic.useInfiniteQuery(
    { search: search || undefined, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  if (q.isLoading) return null;
  if (q.isError)
    return (
      <div className={className}>
        <ErrorState onRetry={() => void q.refetch()} />
      </div>
    );

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const searching = search.trim().length > 0;
  if (items.length === 0 || (!searching && items.length < MIN_BROWSE_ROOMS)) {
    return null;
  }

  return (
    <section aria-labelledby="spaces-title" className={className}>
      <SectionLabel as="h2" id="spaces-title">
        {t("spaces")}
      </SectionLabel>
      <p className="text-muted-foreground mt-2 text-sm">{t("spacesSub")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            disabled={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
