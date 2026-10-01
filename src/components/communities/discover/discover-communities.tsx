"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, MapPin, X } from "lucide-react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateCommunityButton } from "@/components/communities/create-community-dialog";
import {
  foldText,
  type DirectorySort,
  type DirectoryWant,
  type GeoPoint,
} from "@/server/communities/directory";
import { cn } from "@/lib/utils";
import { CommunityCard } from "./community-card";
import { usePlaceLabel } from "./community-signals";
import { gridQueryInput, type DirectoryParams } from "./directory-params";

const DEBOUNCE_MS = 300;

/** Anchor for "Browse communities" in the page's opening. */
export const ALL_COMMUNITIES_ID = "all-communities-title";

/**
 * Columns follow the section's own width (a container query), not the
 * screen's: from `xl` the side panel takes part of the screen.
 */
const GRID = "grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-3 @[96rem]:grid-cols-4";

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

/**
 * A labelled row of toggle chips; one may be pressed, the first means
 * "any". The question is shown, not only announced. Pressed chips are
 * quiet (a tint, a ring and a check), so "any" never outweighs the search.
 */
function ChipFilter<K extends string>({
  id,
  question,
  options,
  value,
  onChange,
}: {
  id: string;
  question: string;
  options: { key: K | null; label: string }[];
  value: K | null;
  onChange: (key: K | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span id={id} className="text-muted-foreground shrink-0 text-sm">
        {question}
      </span>
      <div
        role="group"
        aria-labelledby={id}
        className="-mx-6 -my-1 flex gap-2 overflow-x-auto px-6 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
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
                "focus-visible:ring-ring/50 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px]",
                pressed
                  ? "border-foreground bg-secondary text-foreground font-medium"
                  : "border-border text-foreground hover:bg-muted",
              )}
            >
              {pressed ? (
                <Check aria-hidden="true" className="size-3.5" />
              ) : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Coordinates kept to two decimals (about a kilometre) before sending. */
function coarse(value: number): number {
  return Math.round(value * 100) / 100;
}

type Locating = "idle" | "locating" | "denied" | "failed";

/**
 * The visitor's shared position for "Near you", held on this page only,
 * rounded to about a kilometre (the server rounds again). It is sent in a
 * request body, never in a URL, and never stored.
 */
function useSharedPosition() {
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [state, setState] = useState<Locating>("idle");
  const ask = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("failed");
      return;
    }
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({
          lat: coarse(pos.coords.latitude),
          lng: coarse(pos.coords.longitude),
        });
        setState("idle");
      },
      (error) => setState(error?.code === 1 ? "denied" : "failed"),
      { maximumAge: 10 * 60 * 1000, timeout: 10_000 },
    );
  };
  const forget = () => {
    setPoint(null);
    setState("idle");
  };
  return { point, state, ask, forget };
}

/**
 * What the "Near you" order starts from, said plainly — and when it cannot
 * be near at all, what the order is instead. One live region, always
 * mounted, so screen readers hear every change.
 */
function NearNote({
  active,
  origin,
  anyLocated,
  filtered,
  showPlaces,
  state,
  onAsk,
  onForget,
}: {
  active: boolean;
  origin: { precise: boolean; city: string | null } | null;
  /** Whether any result has an in-person event with a location. */
  anyLocated: boolean;
  /** Whether a search or filter narrows the results. */
  filtered: boolean;
  showPlaces: boolean;
  state: Locating;
  onAsk: () => void;
  onForget: () => void;
}) {
  const t = useTranslations("communities.discover");
  let message: string | null = null;
  let action: { label: string; run: () => void } | null = null;
  if (active) {
    if (!origin) {
      message = t("nearNeedsLocation");
      action = { label: t("useMyLocation"), run: onAsk };
    } else if (!anyLocated) {
      message = filtered ? t("nearNoneLocatedFiltered") : t("nearNoneLocated");
    } else if (origin.precise) {
      message = t("nearPrecise");
      action = { label: t("stopUsingLocation"), run: onForget };
    } else {
      message = origin.city
        ? t("nearFromCity", { city: origin.city })
        : t("nearFromArea");
      action = { label: t("useDeviceLocation"), run: onAsk };
    }
  }
  const trouble =
    active && state === "denied"
      ? t("locationDenied")
      : active && state === "failed"
        ? showPlaces
          ? t("locationFailedPlaces")
          : t("locationFailed")
        : null;
  return (
    <div aria-live="polite" className={cn(!active && "sr-only")}>
      {message ? (
        <div className="text-muted-foreground flex gap-2 text-sm">
          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 space-y-1">
            <p>{message}</p>
            {action && !origin?.precise ? (
              <p className="text-xs">{t("locationPrivacy")}</p>
            ) : null}
            {trouble ? <p>{trouble}</p> : null}
            {action ? (
              <button
                type="button"
                disabled={state === "locating"}
                aria-busy={state === "locating" || undefined}
                onClick={action.run}
                className="text-foreground focus-visible:ring-ring/50 rounded-sm font-medium underline underline-offset-4 outline-none hover:no-underline focus-visible:ring-[3px] disabled:opacity-60"
              >
                {state === "locating" ? t("locating") : action.label}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * "All communities": search (name and description), sort (also by
 * distance), "what do you want" and place filters built from what the
 * communities really offer, and the card grid. Every choice lives in the
 * URL through `onParamsChange` — except a shared position, which stays on
 * this page.
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
  const placeLabel = usePlaceLabel();

  // The box updates at once; the URL (and the query) after a short pause.
  // `sent` remembers what this box last wrote, so the URL catching up never
  // overwrites letters typed since; only an outside change (Back, a link)
  // resets the box. The timer calls the latest `onParamsChange`, so a sort
  // picked during the pause is not undone by stale params.
  const [search, setSearch] = useState(params.q);
  const sent = useRef(params.q);
  const latestChange = useRef(onParamsChange);
  useEffect(() => {
    latestChange.current = onParamsChange;
  });
  useEffect(() => {
    if (params.q !== sent.current) {
      sent.current = params.q;
      setSearch(params.q);
    }
  }, [params.q]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const commitSearch = (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    sent.current = value;
    latestChange.current({ q: value });
  };
  const onSearch = (value: string) => {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commitSearch(value), DEBOUNCE_MS);
  };
  const clearSearch = () => {
    setSearch("");
    commitSearch("");
  };

  const position = useSharedPosition();
  const query = api.communities.directory.useInfiniteQuery(
    gridQueryInput(params, locale, position.point),
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      placeholderData: (prev) => prev,
    },
  );
  const pages = query.data?.pages ?? [];
  // Pages are offsets into a snapshot that can be rebuilt between them; a
  // community that moved up shows once, where it was first seen.
  const seen = new Set<string>();
  const items = pages
    .flatMap((p) => p.items)
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  const total = pages[0]?.total ?? 0;
  const places = (pages[0]?.places ?? []).map((p) => p.key);
  // The URL may spell a place differently from the server's key.
  const selectedPlace = params.place
    ? (places.find((p) => foldText(p) === foldText(params.place!)) ??
      params.place)
    : null;
  if (selectedPlace && !places.includes(selectedPlace)) {
    places.push(selectedPlace);
  }
  // A filter with one option is no choice: show it from two places on.
  const showPlaces = places.length >= 2 || selectedPlace !== null;
  const wants = (pages[0]?.wants ?? []).map((w) => w.key);
  if (params.want && !wants.includes(params.want)) wants.push(params.want);
  const wantLabel: Record<DirectoryWant, string> = {
    meet: t("wantMeet"),
    learn: t("wantLearn"),
    build: t("wantBuild"),
    work: t("wantWork"),
  };
  const near = params.sort === "near";

  const sortOptions: { value: DirectorySort; label: string }[] = [
    { value: "active", label: t("sortActive") },
    { value: "near", label: t("sortNear") },
    { value: "newest", label: t("sortNewest") },
    { value: "largest", label: t("sortLargest") },
  ];

  return (
    <section
      aria-labelledby={ALL_COMMUNITIES_ID}
      className={cn("@container", className)}
    >
      <div className="border-border flex items-baseline justify-between gap-4 border-b pb-2">
        <SectionLabel
          as="h2"
          id={ALL_COMMUNITIES_ID}
          bordered={false}
          className="scroll-mt-24"
        >
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
        <div className="flex max-w-md flex-1 items-center gap-2">
          <span aria-hidden="true" className="text-muted-foreground font-mono">
            &gt;
          </span>
          <div className="relative flex-1">
            <Input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchLabel")}
              className="pr-9 text-sm [&::-webkit-search-cancel-button]:hidden"
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
        {/* Four sorts can be wider than a small phone: scroll, never
            push the page sideways. */}
        <div className="-mx-6 max-w-[calc(100%+3rem)] self-start overflow-x-auto px-6 py-1 sm:mx-0 sm:max-w-full sm:px-0 md:self-auto">
          <SegmentedControl
            aria-label={t("sortLabel")}
            options={sortOptions}
            value={params.sort}
            onValueChange={(sort) => onParamsChange({ sort })}
          />
        </div>
      </div>

      {wants.length > 0 ? (
        <div className="mt-4">
          <ChipFilter<DirectoryWant>
            id="directory-want-label"
            question={t("wantLabel")}
            options={[
              { key: null, label: t("wantAll") },
              ...wants.map((w) => ({ key: w, label: wantLabel[w] })),
            ]}
            value={params.want}
            onChange={(want) => onParamsChange({ want })}
          />
        </div>
      ) : null}

      {showPlaces ? (
        <div className="mt-3">
          <ChipFilter<string>
            id="directory-place-label"
            question={t("placeQuestion")}
            options={[
              { key: null, label: t("placeAll") },
              ...places.map((p) => ({ key: p, label: placeLabel(p) })),
            ]}
            value={selectedPlace}
            onChange={(place) => onParamsChange({ place })}
          />
        </div>
      ) : null}

      <div className={near ? "mt-4" : undefined}>
        <NearNote
          active={near && !!query.data}
          origin={pages[0]?.origin ?? null}
          anyLocated={items.some((c) => c.distanceKm !== null)}
          filtered={!!(params.q || params.place || params.want)}
          showPlaces={showPlaces}
          state={position.state}
          onAsk={position.ask}
          onForget={position.forget}
        />
      </div>

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
            action={
              <CreateCommunityButton variant="outline">
                {t("inviteAction")}
              </CreateCommunityButton>
            }
          />
        ) : (
          <ul
            className={cn(GRID, query.isPlaceholderData && "opacity-60")}
            aria-busy={query.isFetching || undefined}
          >
            {items.map((c) => (
              <li key={c.id} className="min-w-0">
                <CommunityCard community={c} showDistance={near} />
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
