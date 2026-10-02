"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useMediaQuery } from "@/hooks/use-media-query";
import { api, type RouterOutputs } from "@/trpc/react";

import { ToolbarButton } from "./toolbar-button";

export type PickedGif = RouterOutputs["feed"]["searchGifs"]["gifs"][number];

const SEARCH_DELAY_MS = 400;

/**
 * Splits GIFs into two columns, each next GIF going under the shorter one
 * (as GIPHY's own grid does). Appending a page never moves earlier tiles.
 */
export function gifColumns(gifs: PickedGif[]): [PickedGif[], PickedGif[]] {
  const columns: [PickedGif[], PickedGif[]] = [[], []];
  const heights: [number, number] = [0, 0];
  for (const gif of gifs) {
    const at = heights[0] <= heights[1] ? 0 : 1;
    columns[at].push(gif);
    heights[at] += gif.preview.height / Math.max(1, gif.preview.width);
  }
  return columns;
}

/** The member-facing words for a failed search, in their language. */
function errorKey(code: string | undefined) {
  if (code === "TOO_MANY_REQUESTS") return "gifBusy";
  if (code === "PRECONDITION_FAILED") return "gifUnavailable";
  return "gifError";
}

/**
 * The editor's GIF button: a GIPHY search panel, trending until the member
 * types. Results come through our server (`feed.searchGifs`), so the GIPHY
 * key never reaches the browser. Previews are still frames that play only
 * while hovered or focused (and never for reduced motion), so the panel is
 * calm and light. GIPHY's terms ask for its attribution in the search UI.
 */
export function GifPickerButton({
  communitySlug,
  label,
  onPick,
  disabled,
}: {
  communitySlug: string;
  /** "Add GIF" or "Replace with GIF". */
  label: string;
  onPick: (gif: PickedGif) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("communities.feed.editor");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const query = useDebouncedValue(typed.trim(), SEARCH_DELAY_MS);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  // On touch screens the keyboard would cover the trending GIFs.
  const touch = useMediaQuery("(pointer: coarse)", false);

  const results = api.feed.searchGifs.useInfiniteQuery(
    { communitySlug, query, lang: locale === "nl" ? "nl" : "en" },
    {
      enabled: open,
      getNextPageParam: (page) => page.nextCursor,
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
  );
  const gifs = useMemo(() => {
    const seen = new Set<string>();
    return (results.data?.pages ?? [])
      .flatMap((page) => page.gifs)
      .filter((gif) => !seen.has(gif.giphyId) && seen.add(gif.giphyId));
  }, [results.data]);
  const columns = useMemo(() => gifColumns(gifs), [gifs]);

  const status = results.isPending
    ? ""
    : results.isError
      ? t(errorKey(results.error.data?.code))
      : gifs.length === 0
        ? t("gifNone")
        : t("gifCount", { count: gifs.length });

  const tile = (gif: PickedGif) => {
    const playing = !reduceMotion && active === gif.giphyId;
    return (
      <li key={gif.giphyId}>
        <button
          type="button"
          onClick={() => {
            onPick(gif);
            setOpen(false);
          }}
          onMouseEnter={() => setActive(gif.giphyId)}
          onMouseLeave={() => setActive(null)}
          onFocus={() => setActive(gif.giphyId)}
          onBlur={() => setActive(null)}
          aria-label={gif.title || t("gifUntitled")}
          className="focus-visible:ring-ring/50 hover:ring-ring/40 bg-muted relative block w-full overflow-hidden rounded-md outline-none hover:ring-2 focus-visible:ring-[3px]"
          style={{
            aspectRatio: `${gif.preview.width} / ${gif.preview.height}`,
          }}
        >
          {/* The still stays put and the moving preview lies over it,
              never in its place: swapping the element under the pointer
              as it hovers lost the click (a quick click, or a tap, which
              hovers first). The preview takes no pointer events. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- GIPHY media */}
          <img
            src={gif.preview.stillUrl}
            alt=""
            loading="lazy"
            width={gif.preview.width}
            height={gif.preview.height}
            className="size-full object-cover"
          />
          {playing ? (
            <video
              src={gif.preview.mp4Url}
              autoPlay
              loop
              muted
              playsInline
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 size-full object-cover"
            />
          ) : null}
        </button>
      </li>
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setActive(null);
      }}
    >
      <PopoverTrigger asChild>
        <ToolbarButton
          label={label}
          icon={
            <span
              aria-hidden="true"
              className="font-mono text-[0.7rem] font-semibold"
            >
              GIF
            </span>
          }
          disabled={disabled}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={t("gifs")}
        className="flex h-[min(24rem,60vh)] w-[min(22rem,calc(100vw-2rem))] flex-col p-0"
      >
        <div className="relative m-2 mb-1">
          <input
            type="search"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t("gifSearch")}
            aria-label={t("gifSearch")}
            maxLength={50}
            autoFocus={!touch}
            className="border-border bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full appearance-none rounded-md border pr-8 pl-2.5 text-sm outline-none focus-visible:ring-[3px] [&::-webkit-search-cancel-button]:hidden"
          />
          {typed ? (
            <button
              type="button"
              onClick={() => setTyped("")}
              aria-label={t("gifClear")}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1 right-1 flex size-6 items-center justify-center rounded outline-none focus-visible:ring-[3px]"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
        </div>
        <p className="text-muted-foreground truncate px-3 pb-1 font-mono text-xs">
          {query ? t("gifResultsFor", { query }) : t("gifTrending")}
        </p>
        {/* Always mounted: says what the grid now holds (WCAG 4.1.3). */}
        <p role="status" className="sr-only">
          {status}
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {results.isPending ? (
            <div className="grid grid-cols-2 gap-1.5" aria-busy="true">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-24 rounded-md" />
              ))}
            </div>
          ) : results.isError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
              <p className="text-muted-foreground">
                {t(errorKey(results.error.data?.code))}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void results.refetch()}
              >
                {t("tryAgain")}
              </Button>
            </div>
          ) : gifs.length === 0 ? (
            <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
              {t("gifNone")}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 items-start gap-1.5">
                {columns.map((column, i) => (
                  <ul key={i} className="flex flex-col gap-1.5">
                    {column.map(tile)}
                  </ul>
                ))}
              </div>
              {results.hasNextPage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1.5 w-full"
                  disabled={results.isFetchingNextPage}
                  onClick={() => void results.fetchNextPage()}
                >
                  {results.isFetchingNextPage ? (
                    <Loader2
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : null}
                  {t("gifMore")}
                </Button>
              ) : null}
            </>
          )}
        </div>

        <p className="border-border text-muted-foreground border-t px-3 py-1.5 text-right font-mono text-[0.65rem] tracking-wide">
          {t("poweredByGiphy")}
        </p>
      </PopoverContent>
    </Popover>
  );
}
