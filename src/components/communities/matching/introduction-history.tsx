"use client";

import { useFormatter, useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

export function IntroductionHistory({ slug }: { slug: string }) {
  const t = useTranslations("communityMatching");
  const format = useFormatter();
  const query = api.communityMatching.history.useInfiniteQuery(
    { slug },
    { getNextPageParam: (page) => page.nextCursor },
  );
  if (query.isPending) return <Skeleton className="h-40" />;
  if (query.isError) return <ErrorState onRetry={query.refetch} />;
  const items = query.data.pages.flatMap((page) => page.items);
  const members = query.data.pages.flatMap((page) => page.members);
  const name = (id: string) =>
    members.find((member) => member.userId === id)?.displayName ??
    t("memberFallback");
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{t("historyTitle")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("historyDescription")}
        </p>
      </div>
      {items.length === 0 ? (
        <EmptyState
          title={t("noIntroductions")}
          description={t("noIntroductionsDescription")}
        />
      ) : (
        <ul className="divide-y border-y">
          {items.map((intro) => (
            <li key={intro.id} className="space-y-2 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium break-words">
                  {name(intro.userIdA)} &amp; {name(intro.userIdB)}
                </p>
                <Badge variant="secondary">{t(`status.${intro.status}`)}</Badge>
              </div>
              {intro.reason && (
                <p className="text-muted-foreground max-w-prose text-sm break-words whitespace-pre-wrap">
                  {intro.reason}
                </p>
              )}
              <p className="text-muted-foreground text-xs">
                {format.dateTime(new Date(intro.createdAt), {
                  dateStyle: "medium",
                })}
              </p>
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
