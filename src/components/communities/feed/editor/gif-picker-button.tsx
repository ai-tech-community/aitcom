"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

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
 * The editor's GIF button: a GIPHY search panel, trending until the member
 * types. Results come through our server (`feed.searchGifs`), so the
 * GIPHY key never reaches the browser. Previews play as small looping
 * videos, or stay still for members who ask for reduced motion. GIPHY's
 * terms ask for its attribution in the search UI.
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
  const query = useDebouncedValue(typed.trim(), SEARCH_DELAY_MS);
  const still = useMediaQuery("(prefers-reduced-motion: reduce)", false);

  const results = api.feed.searchGifs.useInfiniteQuery(
    { communitySlug, query, lang: locale === "nl" ? "nl" : "en" },
    {
      enabled: open,
      getNextPageParam: (page) => page.nextCursor,
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
  );
  const gifs = results.data?.pages.flatMap((page) => page.gifs) ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
        className="flex h-[24rem] w-[min(22rem,calc(100vw-2rem))] flex-col p-0"
      >
        <input
          type="search"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={t("gifSearch")}
          aria-label={t("gifSearch")}
          maxLength={50}
          autoFocus
          className="border-border bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 m-2 mb-1 h-8 appearance-none rounded-md border px-2.5 text-sm outline-none focus-visible:ring-[3px] [&::-webkit-search-cancel-button]:hidden"
        />
        <p className="text-muted-foreground px-3 pb-1 font-mono text-xs">
          {query ? t("gifResults") : t("gifTrending")}
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
                {results.error.data?.code === "TOO_MANY_REQUESTS" ||
                results.error.data?.code === "PRECONDITION_FAILED"
                  ? results.error.message
                  : t("gifError")}
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
              <ul className="columns-2 gap-1.5">
                {gifs.map((gif) => (
                  <li key={gif.giphyId} className="mb-1.5 break-inside-avoid">
                    <button
                      type="button"
                      onClick={() => {
                        onPick(gif);
                        setOpen(false);
                      }}
                      aria-label={gif.title || t("gifUntitled")}
                      className="focus-visible:ring-ring/50 bg-muted block w-full overflow-hidden rounded-md outline-none focus-visible:ring-[3px]"
                      style={{
                        aspectRatio: `${gif.preview.width} / ${gif.preview.height}`,
                      }}
                    >
                      {still ? (
                        // eslint-disable-next-line @next/next/no-img-element -- GIPHY media
                        <img
                          src={gif.preview.stillUrl}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <video
                          src={gif.preview.mp4Url}
                          poster={gif.preview.stillUrl}
                          autoPlay
                          loop
                          muted
                          playsInline
                          preload="none"
                          aria-hidden="true"
                          className="size-full object-cover"
                        />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {results.hasNextPage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
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
