"use client";

import { AlertTriangleIcon, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** The slice of a TanStack infinite query that paging needs. */
export type LoadMoreQuery = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** The last "load more" failed (the pages already shown stay). */
  isFetchNextPageError?: boolean;
  fetchNextPage: () => unknown;
};

/**
 * "Load more" under a paged list. A failed next page says so in place, with
 * a retry, instead of leaving the button as if nothing happened; the pages
 * already shown stay put. Renders nothing once there are no more pages.
 */
export function LoadMore({
  query,
  label,
  className,
}: {
  query: LoadMoreQuery;
  /** Defaults to the shared "Load more". */
  label?: string;
  className?: string;
}) {
  const t = useTranslations("common");
  const loadMore = () => void query.fetchNextPage();

  if (query.isFetchNextPageError && !query.isFetchingNextPage) {
    return (
      <p
        role="alert"
        className={cn(
          "text-muted-foreground flex items-center justify-center gap-2 pt-2 text-sm",
          className,
        )}
      >
        <AlertTriangleIcon
          aria-hidden
          className="text-destructive size-4 shrink-0"
        />
        <span>{t("loadMoreError")}</span>
        <Button type="button" variant="ghost" size="sm" onClick={loadMore}>
          {t("retry")}
        </Button>
      </p>
    );
  }
  if (!query.hasNextPage) return null;

  return (
    <div className={cn("flex justify-center pt-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={loadMore}
        disabled={query.isFetchingNextPage}
      >
        {query.isFetchingNextPage ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : null}
        {label ?? t("loadMore")}
      </Button>
    </div>
  );
}
