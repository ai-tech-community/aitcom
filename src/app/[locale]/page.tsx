import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { HeroTitle } from "@/components/hero-title";
import { Button } from "@/components/ui/button";
import { HomeHeroPlaza } from "@/components/home/town-square/home-hero-plaza";
import type { NoticeBoardContent } from "@/components/home/town-square/town-square-scene";
import { CREATE_COMMUNITY_HREF } from "@/components/communities/create-community-link";
import {
  completeUpcomingCandidates,
  formatEventShortWhen,
  pastEvents,
  pastEventsQueryCeiling,
  upcomingEvents,
  upcomingEventsQueryFloor,
} from "@/lib/event-time";
import { getPayloadClient } from "@/server/payload";
import { db } from "@/server/db";
import { communities, memberProfiles } from "@/server/db/schema";
import { count, isNull } from "drizzle-orm";
import { publicRosterVisibility } from "@/server/members/public-roster";
import type { Metadata } from "next";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { JsonLd } from "@/components/json-ld";
import { getSession } from "@/server/better-auth/server";
import { loadFeaturedCommunities } from "@/server/communities/featured-queries";
import { toEventRowInput } from "@/components/home/event-rows/to-event-row-input";
import { loadEventHostNames } from "@/server/events/event-hosts-queries";
import { RECENT_GATHERINGS_SHOWN } from "@/components/home/recent-gatherings/recent-gatherings";
import { HomeStats } from "@/components/home/home-stats";
import { HomeSections } from "@/components/home/home-sections";
import { toHomeSponsor } from "@/components/home/sponsors/home-sponsor";

/**
 * Rows fetched for the upcoming-events block. The block shows 5; the rest
 * covers up to two days of already-past rows (the zone-safe floor) and the
 * trailing days completeUpcomingCandidates() drops when a page comes back
 * full.
 */
const UPCOMING_EVENT_CANDIDATES = 50;

/**
 * Past rows fetched for "Recently on the square". A few more than shown, so
 * events that started but are still running today (not over yet) cannot
 * leave the section short.
 */
const RECENT_EVENT_CANDIDATES = 12;

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...buildOgMeta(
      "AIT Community - Where Engineers and AI Agents Build Together",
      "The home for AI communities. Host yours, onboard your people, and grow together.",
    ),
    alternates: await localeAlternates(""),
  };
}

export default async function Home() {
  const [locale, t, session] = await Promise.all([
    getLocale(),
    getTranslations(),
    getSession(),
  ]);

  const payload = await getPayloadClient();
  const now = new Date();
  // Independent reads, fetched together: upcoming events, recent past
  // events and the featured sponsors.
  const [
    { docs: eventCandidates },
    { docs: recentCandidates },
    { docs: featuredSponsors },
  ] = await Promise.all([
    payload.find({
      collection: "events",
      where: {
        status: { equals: "published" },
        // Wide floor; upcomingEvents() below applies the per-zone "today".
        date: { greater_than_equal: upcomingEventsQueryFloor(now) },
        // Discovered (Luma) events are "scheduled around, not attended
        // through" (CONTEXT.md [[discovered-event]]) — keep them out of
        // hub-wide public attend-through surfaces like this upcoming-events
        // block; they stay in the conflict corpus (corpus.ts untouched).
        discoverySource: { not_equals: "luma" },
      },
      sort: "date",
      // Headroom for the past-two-days rows the floor lets through and for
      // completeUpcomingCandidates(), which drops the last fetched days of a
      // full page so ranking by start instant cannot skip an unfetched event.
      limit: UPCOMING_EVENT_CANDIDATES,
      locale: locale as "en" | "nl",
      draft: false,
    }),
    // Proof for "Recently on the square": the latest gatherings that took
    // place, with the same filters as the upcoming list. The wide ceiling
    // mirrors the upcoming floor (an event far east of UTC can be over
    // while its stored date is still ahead of now); pastEvents() below
    // does the exact filtering.
    payload.find({
      collection: "events",
      where: {
        status: { equals: "published" },
        date: { less_than: pastEventsQueryCeiling(now) },
        discoverySource: { not_equals: "luma" },
      },
      sort: "-date",
      limit: RECENT_EVENT_CANDIDATES,
      locale: locale as "en" | "nl",
      draft: false,
    }),
    payload.find({
      collection: "sponsors",
      where: {
        status: { equals: "active" },
        featured: { equals: true },
      },
      limit: 20,
      depth: 1,
    }),
  ]);
  const recentEvents = pastEvents(recentCandidates, now).slice(
    0,
    RECENT_GATHERINGS_SHOWN,
  );

  // Soonest real start first (same-day events by time, then id); ended
  // events drop out, so the list and the notice board agree on "next up".
  const events = upcomingEvents(
    completeUpcomingCandidates(eventCandidates, UPCOMING_EVENT_CANDIDATES),
    now,
  ).slice(0, 5);

  // The town-square notice board shows the real next event, or a calm
  // "being planned" line — never blank, never invented.
  const nextEvent = events[0];
  const boardLabel = t("hero.board.label");
  const nextWhen = nextEvent ? formatEventShortWhen(nextEvent, locale) : "";
  const noticeBoard: NoticeBoardContent = nextEvent
    ? {
        kind: "event",
        label: boardLabel,
        title: nextEvent.title,
        when: nextWhen,
      }
    : {
        kind: "empty",
        label: boardLabel,
        message: t("hero.board.empty"),
      };
  // The art is aria-hidden; this link carries the board's content.
  const boardLink = nextEvent
    ? {
        href: `/events/${nextEvent.slug}`,
        label: `${boardLabel}: ${nextEvent.title}, ${nextWhen}`,
      }
    : {
        href: "/events",
        label: `${t("hero.board.empty")} ${t("events.viewAll")}`,
      };

  // Fetch real counts for stats ticker
  const [memberCount, eventCount, sponsorCount] = await Promise.all([
    db
      .select({ value: count() })
      .from(memberProfiles)
      .where(publicRosterVisibility())
      .then((r) => r[0]?.value ?? 0),
    payload
      .find({
        collection: "events",
        where: { status: { not_equals: "draft" } },
        limit: 0,
      })
      .then((r) => r.totalDocs),
    payload
      .find({
        collection: "sponsors",
        where: { status: { equals: "active" } },
        limit: 0,
      })
      .then((r) => r.totalDocs),
  ]);

  const [featuredCommunities, communityCount, hostNames] = await Promise.all([
    loadFeaturedCommunities(db),
    db
      .select({ value: count() })
      .from(communities)
      .where(isNull(communities.deletedAt))
      .then((r) => r[0]?.value ?? 0),
    // One lookup for the hosts of both upcoming and recent gatherings.
    loadEventHostNames(
      db,
      [...events, ...recentEvents].map((event) => event.communityId),
    ),
  ]);

  const upcomingEventRows = events.map((event) =>
    toEventRowInput(event, hostNames),
  );
  const recentEventRows = recentEvents.map((event) =>
    toEventRowInput(event, hostNames),
  );

  const workshopCount = await payload
    .find({
      collection: "events",
      where: {
        type: { in: ["workshop", "deep_dive"] },
        status: { not_equals: "draft" },
      },
      limit: 0,
    })
    .then((r) => r.totalDocs);

  const hackathonCount = await payload
    .find({
      collection: "events",
      where: { type: { equals: "hackathon" }, status: { not_equals: "draft" } },
      limit: 0,
    })
    .then((r) => r.totalDocs);

  return (
    <>
      <JsonLd
        data={{
          "@type": "Organization",
          name: "AIT Community",
          url: "https://aitcommunity.org",
          logo: "https://aitcommunity.org/logo.png",
          description:
            "The home for AI communities. Host yours, onboard your people, and grow together.",
        }}
      />
      {/* Hero: the town square */}
      <HomeHeroPlaza board={noticeBoard} boardLink={boardLink}>
        <HeroTitle title={t("hero.title")} tagline={t("hero.subtitle")} />
        <p className="text-muted-foreground mt-5 max-w-xl text-base leading-relaxed text-pretty sm:text-lg">
          {t("hero.description")}
        </p>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
          <Button asChild variant="ink" size="lg">
            <Link href="/communities">{t("hero.cta")}</Link>
          </Button>
          <Button asChild variant="ink" size="lg">
            <Link href={CREATE_COMMUNITY_HREF}>{t("hero.host")}</Link>
          </Button>
        </div>
      </HomeHeroPlaza>

      <HomeStats
        counts={{
          communities: communityCount,
          profiles: memberCount,
          events: eventCount,
          workshops: workshopCount,
          hackathons: hackathonCount,
          sponsors: sponsorCount,
        }}
      />

      <HomeSections
        featuredCommunities={featuredCommunities}
        upcomingEvents={upcomingEventRows}
        recentEvents={recentEventRows}
        sponsors={featuredSponsors.map(toHomeSponsor)}
        signedIn={!!session?.user}
        now={now}
      />
    </>
  );
}
