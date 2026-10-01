"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useStartCreateCommunity } from "@/components/communities/create-community-dialog";
import { CommunityStreet } from "./community-street";
import type { StreetHouse } from "./community-street-scene";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  ActivityLine,
  NextEventLine,
  type DirectoryItem,
} from "./community-signals";
import { JoinAction } from "./join-action";
import { BODY_FRAME } from "./explore-layout";
import { squareQueryInput } from "./directory-params";

/** Air between the headline and the first house. */
const COPY_GAP_PX = 32;

/**
 * The line under the street. While nobody points at a house it is the
 * legend; once someone does, it becomes a small preview of that house —
 * its live facts, Join and Visit — and stays on it until the pointer
 * leaves the street area, so the pointer can travel to the Join button.
 * The legend is mouse-only context (aria-hidden); the preview holds real
 * controls, and the directory grid repeats every fact for everyone.
 */
function StreetPeek({ community }: { community: DirectoryItem | null }) {
  const t = useTranslations("communities.discover");
  if (!community) {
    return (
      <p aria-hidden="true" className="text-muted-foreground text-sm">
        {t("squareHint")}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="text-sm font-semibold">{community.name}</span>
      {community.activeRecently > 0 ? (
        <ActivityLine count={community.activeRecently} />
      ) : null}
      {community.nextEvent ? (
        <NextEventLine event={community.nextEvent} />
      ) : null}
      <span className="flex items-center gap-3">
        <JoinAction
          slug={community.slug}
          name={community.name}
          joinPolicy={community.joinPolicy}
        />
        <Link
          href={`/communities/${community.slug}`}
          className="text-foreground hover:text-foreground/80 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
        >
          {t("visit")}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </span>
    </div>
  );
}

/**
 * Share of the street's width the headline column covers (plus air), so
 * no house is drawn under the words. Measured, because the column sits in
 * the centred page frame while the street runs edge to edge.
 */
function useReservedShare(
  street: RefObject<HTMLElement | null>,
  copy: RefObject<HTMLElement | null>,
  enabled: boolean,
): { share: number; measured: boolean } {
  const [state, setState] = useState({ share: 0, measured: false });
  // Layout effect: the first measure lands before paint, so houses never
  // flash under the headline.
  useLayoutEffect(() => {
    if (!enabled) {
      setState({ share: 0, measured: true });
      return;
    }
    const measure = () => {
      const s = street.current?.getBoundingClientRect();
      const c = copy.current?.getBoundingClientRect();
      if (!s || !c || s.width <= 0) return;
      const next = (c.right + COPY_GAP_PX - s.left) / s.width;
      // Whole percents: no redraw for sub-pixel jitter.
      const share = Math.round(Math.min(0.9, Math.max(0, next)) * 100) / 100;
      setState((prev) =>
        prev.measured && prev.share === share
          ? prev
          : { share, measured: true },
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (street.current) observer?.observe(street.current);
    if (copy.current) observer?.observe(copy.current);
    return () => observer?.disconnect();
  }, [street, copy, enabled]);
  return state;
}

/**
 * The page's opening: the street runs edge to edge — the most active
 * communities as houses (lit windows for recent activity, a flag for an
 * upcoming event, people for members) and an empty lot inviting the next
 * one — with the headline standing on its left from `lg` up. Below `lg`
 * the headline sits above a shorter street.
 */
export function SquareHero({
  headline,
  className,
}: {
  /** The page's h1, tagline and primary action. */
  headline: ReactNode;
  className?: string;
}) {
  const t = useTranslations("communities.discover");
  const locale = useLocale() as "en" | "nl";
  const startCreate = useStartCreateCommunity();
  const wide = useMediaQuery("(min-width: 1024px)", false);
  const streetRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const { share: reserve, measured } = useReservedShare(
    streetRef,
    copyRef,
    wide,
  );

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const query = api.communities.directory.useQuery(squareQueryInput(locale));
  const items = useMemo(
    () => (query.isError ? [] : (query.data?.items ?? [])),
    [query.isError, query.data],
  );
  const houses = useMemo<StreetHouse[]>(
    () =>
      items.map((c) => ({
        slug: c.slug,
        name: c.name,
        memberCount: c.memberCount,
        activeRecently: c.activeRecently,
        hasUpcomingEvent: c.nextEvent !== null,
      })),
    [items],
  );
  const active = items.find((c) => c.slug === activeSlug) ?? null;

  return (
    <section className={className} onPointerLeave={() => setActiveSlug(null)}>
      <div className="relative">
        <div
          className={`${BODY_FRAME} pt-10 sm:pt-14 lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-0 lg:z-10`}
        >
          <div
            ref={copyRef}
            className="max-w-xl lg:pointer-events-auto lg:max-w-md xl:max-w-lg"
          >
            {headline}
          </div>
        </div>
        <div ref={streetRef}>
          <CommunityStreet
            houses={measured ? houses : []}
            activeSlug={activeSlug}
            onActiveChange={setActiveSlug}
            reserve={reserve}
            lotLabel={measured ? t("lotSign") : null}
            onLotClick={startCreate}
            className="border-border mt-8 h-56 border-b sm:h-72 lg:mt-0 lg:h-[30rem]"
          />
        </div>
      </div>
      {/* The grid below reads the same directory, so its empty and error
          states speak once for the page; with no houses there is no
          legend to read. Its space is kept while loading: no jump. */}
      {query.isLoading || items.length > 0 ? (
        <div className={`${BODY_FRAME} mt-3 min-h-8`}>
          {items.length > 0 ? <StreetPeek community={active} /> : null}
        </div>
      ) : null}
    </section>
  );
}
