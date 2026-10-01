"use client";

import {
  useEffect,
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
import {
  ActivityLine,
  JoinPolicyLabel,
  NextEventLine,
  type DirectoryItem,
} from "./community-signals";
import { BODY_FRAME } from "./explore-layout";
import { squareQueryInput } from "./directory-params";

/** Air between the headline and the first house. */
const COPY_GAP_PX = 32;

/**
 * The line under the street: the legend while nobody is pointing, the
 * pointed-at community's facts while someone is. Mouse-only (the street
 * is), so it is hidden from screen readers; the grid carries the facts.
 */
function StreetCaption({ community }: { community: DirectoryItem | null }) {
  const t = useTranslations("communities.discover");
  if (!community) {
    return <p className="text-muted-foreground text-sm">{t("squareHint")}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      <span className="text-sm font-semibold">{community.name}</span>
      {community.activeRecently > 0 ? (
        <ActivityLine count={community.activeRecently} />
      ) : null}
      {community.nextEvent ? (
        <NextEventLine event={community.nextEvent} />
      ) : null}
      <JoinPolicyLabel policy={community.joinPolicy} />
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
): number {
  const [share, setShare] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setShare(0);
      return;
    }
    const measure = () => {
      const s = street.current?.getBoundingClientRect();
      const c = copy.current?.getBoundingClientRect();
      if (!s || !c || s.width <= 0) return;
      const next = (c.right + COPY_GAP_PX - s.left) / s.width;
      // Whole percents: no redraw for sub-pixel jitter.
      setShare(Math.round(Math.min(0.9, Math.max(0, next)) * 100) / 100);
    };
    measure();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (street.current) observer?.observe(street.current);
    if (copy.current) observer?.observe(copy.current);
    return () => observer?.disconnect();
  }, [street, copy, enabled]);
  return share;
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
  const reserve = useReservedShare(streetRef, copyRef, wide);

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
    <section className={className}>
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
            houses={houses}
            activeSlug={activeSlug}
            onActiveChange={setActiveSlug}
            reserve={reserve}
            lotLabel={t("lotSign")}
            onLotClick={startCreate}
            className="border-border mt-8 h-56 border-b sm:h-72 lg:mt-0 lg:h-[30rem]"
          />
        </div>
      </div>
      {/* The grid below reads the same directory, so its empty and error
          states speak once for the page; with no houses there is no
          legend to read. */}
      {items.length > 0 ? (
        <div aria-hidden="true" className={`${BODY_FRAME} mt-3 min-h-6`}>
          <StreetCaption community={active} />
        </div>
      ) : null}
    </section>
  );
}
