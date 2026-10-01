"use client";

import {
  useEffect,
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
import { ArrowRight, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import {
  ActivityLine,
  NextEventLine,
  type DirectoryItem,
} from "./community-signals";
import { JoinAction } from "./join-action";
import { BODY_FRAME } from "./explore-layout";
import { squareQueryInput } from "./directory-params";
import { useSquareRooms } from "./square-rooms";
import { useSquareNight } from "./amsterdam-night";

/** Air between the headline and the first house. */
const COPY_GAP_PX = 32;

/** Which signs are on the street right now, for the legend. */
type StreetSigns = {
  flag: boolean;
  bubble: boolean;
  scaffold: boolean;
  night: boolean;
};

/**
 * The legend: only the signs the street shows right now, as short
 * fragments (lit windows are always there). Mouse-and-eye context, so
 * aria-hidden; the directory grid states every fact as text.
 */
function StreetLegend({ signs }: { signs: StreetSigns }) {
  const t = useTranslations("communities.discover");
  const parts = [
    t("legendWindows"),
    signs.flag ? t("legendFlag") : null,
    signs.bubble ? t("legendBubble") : null,
    signs.scaffold ? t("legendScaffold") : null,
    signs.night ? t("legendNight") : null,
  ].filter(Boolean);
  return (
    <p aria-hidden="true" className="text-muted-foreground text-sm">
      {parts.join(" · ")}
    </p>
  );
}

/**
 * The line under the street. While nobody points at a house it is the
 * legend; once someone does, it becomes a small preview of that house —
 * every sign it shows in words, Join and Visit — and stays on it until the
 * pointer leaves the street area, so the pointer can reach Join.
 */
function StreetPeek({
  community,
  talking,
  signs,
  onJoinPress,
}: {
  community: DirectoryItem | null;
  talking: boolean;
  signs: StreetSigns;
  onJoinPress: () => void;
}) {
  const t = useTranslations("communities.discover");
  if (!community) return <StreetLegend signs={signs} />;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold">{community.name}</span>
        {community.isNew ? (
          <Badge variant="secondary">{t("isNew")}</Badge>
        ) : null}
      </span>
      {community.activeRecently > 0 ? (
        <ActivityLine count={community.activeRecently} />
      ) : null}
      {community.nextEvent ? (
        <NextEventLine event={community.nextEvent} />
      ) : null}
      {talking ? (
        <span className="text-foreground inline-flex items-center gap-2 text-sm">
          <MessageCircle
            aria-hidden="true"
            className="text-muted-foreground size-4"
          />
          {t("talkedToday")}
        </span>
      ) : null}
      <span className="flex items-center gap-3">
        <JoinAction
          slug={community.slug}
          name={community.name}
          joinPolicy={community.joinPolicy}
          onPress={onJoinPress}
        />
        <Link
          href={`/communities/${community.slug}`}
          className="text-foreground hover:text-foreground/80 focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
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

/** How long the pointer must rest on another house before the peek moves. */
const HOVER_INTENT_MS = 150;

/**
 * Which house the peek shows. The first house shows at once; moving to
 * another one waits until the pointer rests there, so crossing houses on
 * the way to the peek's Join button does not change its target. Pressing
 * Join pins the peek (the sign-in dialog takes the pointer away), until
 * the visitor points at another house.
 */
function useStreetPeek() {
  const [slug, setSlug] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  return {
    slug,
    point: (next: string | null) => {
      cancel();
      if (next === null || next === slug) return;
      const show = () => {
        setSlug(next);
        setPinned(false);
      };
      if (slug === null) show();
      else timer.current = setTimeout(show, HOVER_INTENT_MS);
    },
    release: () => {
      cancel();
      if (!pinned) setSlug(null);
    },
    pin: () => setPinned(true),
  };
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

  const peek = useStreetPeek();
  const query = api.communities.directory.useQuery(squareQueryInput(locale));
  const items = useMemo(
    () => (query.isError ? [] : (query.data?.items ?? [])),
    [query.isError, query.data],
  );
  const rooms = useSquareRooms();
  const night = useSquareNight();
  const talking = useMemo(
    () => new Set(rooms.data?.talkingCommunities ?? []),
    [rooms.data],
  );
  const houses = useMemo<StreetHouse[]>(
    () =>
      items.map((c) => ({
        slug: c.slug,
        name: c.name,
        memberCount: c.memberCount,
        activeRecently: c.activeRecently,
        hasUpcomingEvent: c.nextEvent !== null,
        talking: talking.has(c.slug),
        isNew: c.isNew,
      })),
    [items, talking],
  );
  const active = items.find((c) => c.slug === peek.slug) ?? null;
  const signs: StreetSigns = {
    flag: houses.some((h) => h.hasUpcomingEvent),
    bubble: houses.some((h) => h.talking),
    scaffold: houses.some((h) => h.isNew),
    night,
  };

  return (
    <section className={className} onPointerLeave={peek.release}>
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
            activeSlug={peek.slug}
            onActiveChange={peek.point}
            reserve={reserve}
            lotLabel={measured ? t("lotSign") : null}
            night={night}
            onLotClick={startCreate}
            className="border-border mt-8 h-56 border-b sm:h-72 lg:mt-0 lg:h-[30rem]"
          />
        </div>
      </div>
      {/* The grid below reads the same directory, so its empty and error
          states speak once for the page; with no houses there is no
          legend to read. Its space is kept while loading: no jump. */}
      {query.isLoading || items.length > 0 ? (
        // Tall enough for a wrapped legend or the peek: no jump on hover.
        <div className={`${BODY_FRAME} mt-3 min-h-12`}>
          {items.length > 0 ? (
            <StreetPeek
              community={active}
              talking={active ? talking.has(active.slug) : false}
              signs={signs}
              onJoinPress={peek.pin}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
