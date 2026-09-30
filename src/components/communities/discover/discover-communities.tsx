"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { X } from "lucide-react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateCommunityButton } from "@/components/communities/create-community-dialog";
import type { DirectorySort } from "@/server/communities/directory";
import { cn } from "@/lib/utils";
import { CommunityCard } from "./community-card";
import { usePlaceLabel } from "./community-signals";
import { gridQueryInput, type DirectoryParams } from "./directory-params";

const DEBOUNCE_MS = 300;

const GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

function GridSkeleton() {
  return (
    <div className={GRID} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="border-border flex flex-col gap-4 rounded-xl border p-6"
        >
          <div className="flex gap-3">
            <Skeleton className="size-10 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="mt-4 h-7 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Place chips: "Everywhere" plus every place with upcoming events. */
function PlaceFilter({
  places,
  value,
  onChange,
}: {
  places: string[];
  value: string | null;
  onChange: (place: string | null) => void;
}) {
  const t = useTranslations("communities.discover");
  const placeLabel = usePlaceLabel();
  const options: { key: string | null; label: string }[] = [
    { key: null, label: t("placeAll") },
    ...places.map((p) => ({ key: p, label: placeLabel(p) })),
  ];
  return (
    <div
      role="group"
      aria-label={t("placeLabel")}
      className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {options.map((o) => {
        const pressed = o.key === value;
        return (
          <button
            key={o.key ?? "all"}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(o.key)}
            className={cn(
              "focus-visible:ring-ring/50 h-8 shrink-0 rounded-full border px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px]",
              pressed
                ? "border-foreground bg-foreground text-background"
                : "border-border text-foreground hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * "All communities": search (name and description), sort, a place filter
 * from the communities' own upcoming events, and the card grid. Every
 * choice lives in the URL through `onParamsChange`.
 */
export function DiscoverCommunities({
  params,
  onParamsChange,
  className,
}: {
  params: DirectoryParams;
  onParamsChange: (patch: Partial<DirectoryParams>) => void;
  className?: string;
}) {
  const t = useTranslations("communities.discover");
  const locale = useLocale() as "en" | "nl";

  // The box updates at once; the URL (and the query) after a short pause.
  const [search, setSearch] = useState(params.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setSearch(params.q), [params.q]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const onSearch = (value: string) => {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => onParamsChange({ q: value }),
      DEBOUNCE_MS,
    );
  };
  const clearSearch = () => {
    if (timer.current) clearTimeout(timer.current);
    setSearch("");
    onParamsChange({ q: "" });
  };

  const query = api.communities.directory.useInfiniteQuery(
    gridQueryInput(params, locale),
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      placeholderData: (prev) => prev,
    },
  );
  const pages = query.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const total = pages[0]?.total ?? 0;
  const places = (pages[0]?.places ?? []).map((p) => p.key);
  if (params.place && !places.includes(params.place)) places.push(params.place);

  const sortOptions: { value: DirectorySort; label: string }[] = [
    { value: "active", label: t("sortActive") },
    { value: "newest", label: t("sortNewest") },
    { value: "largest", label: t("sortLargest") },
  ];

  return (
    <section aria-labelledby="all-communities-title" className={className}>
      <div className="border-border flex items-baseline justify-between gap-4 border-b pb-2">
        <SectionLabel as="h2" id="all-communities-title" bordered={false}>
          {t("allCommunities")}
        </SectionLabel>
        {query.data ? (
          <span
            aria-live="polite"
            className="text-muted-foreground font-mono text-xs tabular-nums"
          >
            {t("resultsCount", { count: total })}
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-md flex-1 items-center gap-2 font-mono">
          <span aria-hidden="true" className="text-muted-foreground">
            &gt;
          </span>
          <div className="relative flex-1">
            <Input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchLabel")}
              className="pr-9 font-mono text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {search ? (
              <button
                type="button"
                onClick={clearSearch}
                aria-label={t("clearSearch")}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md outline-none focus-visible:ring-[3px]"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
        <SegmentedControl
          aria-label={t("sortLabel")}
          options={sortOptions}
          value={params.sort}
          onValueChange={(sort) => onParamsChange({ sort })}
          className="self-start md:self-auto"
        />
      </div>

      {places.length > 0 ? (
        <div className="mt-4">
          <PlaceFilter
            places={places}
            value={params.place}
            onChange={(place) => onParamsChange({ place })}
          />
        </div>
      ) : null}

      <div className="mt-6">
        {query.isLoading ? (
          <GridSkeleton />
        ) : query.isError ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            className="border-border rounded-xl border"
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={<CreateCommunityButton variant="outline" />}
          />
        ) : (
          <ul
            className={cn(GRID, query.isPlaceholderData && "opacity-60")}
            aria-busy={query.isFetching || undefined}
          >
            {items.map((c) => (
              <li key={c.id} className="min-w-0">
                <CommunityCard community={c} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {query.hasNextPage ? (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
