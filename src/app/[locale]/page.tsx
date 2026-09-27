import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight } from "lucide-react";
import { HeroTitle } from "@/components/hero-title";
import { Button } from "@/components/ui/button";
import { HomeHeroPlaza } from "@/components/home/town-square/home-hero-plaza";
import type { NoticeBoardContent } from "@/components/home/town-square/town-square-scene";
import { CREATE_COMMUNITY_HREF } from "@/components/communities/create-community-link";
import {
  formatEventShortWhen,
  upcomingEvents,
  upcomingEventsQueryFloor,
} from "@/lib/event-time";
import { getPayloadClient } from "@/server/payload";
import { db } from "@/server/db";
import { communities, memberProfiles } from "@/server/db/schema";
import { count, isNull } from "drizzle-orm";
import { publicRosterVisibility } from "@/server/members/public-roster";
import Image from "next/image";
import type { Metadata } from "next";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { JsonLd } from "@/components/json-ld";
import { getSession } from "@/server/better-auth/server";
import { loadFeaturedCommunities } from "@/server/communities/featured-queries";
import { FeaturedCommunities } from "@/components/home/featured-communities/featured-communities";
import { HomeCrawlDoors } from "@/components/home/home-crawl-doors";
import { WhatWeDo } from "@/components/home/what-we-do/what-we-do";
import { UpcomingEvents } from "@/components/home/upcoming-events/upcoming-events";
import type { UpcomingEventInput } from "@/components/home/upcoming-events/upcoming-event-rows";
import { loadEventHostNames } from "@/server/events/event-hosts-queries";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border border-b pb-4">
      <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
        {children}
      </h2>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 sm:gap-2 sm:px-6 sm:py-0">
      <span className="text-muted-foreground font-mono text-xs tracking-wider sm:text-xs">
        {label}:
      </span>
      <span className="text-foreground font-mono text-xs font-semibold tracking-wider sm:text-xs">
        {value}
      </span>
    </div>
  );
}

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
  const [locale, t, session, doors] = await Promise.all([
    getLocale(),
    getTranslations(),
    getSession(),
    getTranslations("hubDoors"),
  ]);

  const payload = await getPayloadClient();
  const { docs: eventCandidates } = await payload.find({
    collection: "events",
    where: {
      status: { equals: "published" },
      // Wide floor; upcomingEvents() below applies the per-zone "today".
      date: { greater_than_equal: upcomingEventsQueryFloor() },
      // Discovered (Luma) events are "scheduled around, not attended
      // through" (CONTEXT.md [[discovered-event]]) — keep them out of
      // hub-wide public attend-through surfaces like this upcoming-events
      // block; they stay in the conflict corpus (corpus.ts untouched).
      discoverySource: { not_equals: "luma" },
    },
    sort: "date",
    // Headroom for the past-two-days rows the floor lets through.
    limit: 20,
    locale: locale as "en" | "nl",
    draft: false,
  });
  const events = upcomingEvents(eventCandidates).slice(0, 5);

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

  const { docs: featuredSponsors } = await payload.find({
    collection: "sponsors",
    where: {
      status: { equals: "active" },
      featured: { equals: true },
    },
    limit: 20,
    depth: 1,
  });

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
    loadEventHostNames(
      db,
      events.map((event) => event.communityId),
    ),
  ]);

  const upcomingEventRows: UpcomingEventInput[] = events.map((event) => ({
    id: event.id,
    slug: event.slug,
    title: event.title,
    type: event.type,
    format: event.format,
    date: event.date,
    startTime: event.startTime,
    timezone: event.timezone,
    city: event.city,
    country: event.country,
    location: event.location,
    host: event.communityId ? (hostNames.get(event.communityId) ?? null) : null,
  }));

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

      {/* Stats Ticker */}
      <div className="border-border grid grid-cols-2 gap-y-1 border-y px-4 py-3 sm:flex sm:items-center sm:gap-y-0 sm:overflow-x-auto sm:px-0 sm:py-2.5">
        <StatItem label="COMMUNITIES" value={String(communityCount)} />
        <StatItem label="PEOPLE" value={String(memberCount)} />
        <StatItem label="EVENTS" value={String(eventCount)} />
        <StatItem label="WORKSHOPS" value={String(workshopCount)} />
        <StatItem label="HACKATHONS" value={String(hackathonCount)} />
        <StatItem label="SPONSORS" value={String(sponsorCount)} />
      </div>

      {featuredCommunities.length > 0 ? (
        <FeaturedCommunities communities={featuredCommunities} />
      ) : null}

      <HomeCrawlDoors t={doors} signedIn={!!session?.user} />

      <WhatWeDo />

      <UpcomingEvents events={upcomingEventRows} />

      {/* Why AI + Humans */}
      <section className="px-6 py-12 sm:px-12">
        <SectionLabel>/ {t("aiHumans.title").toUpperCase()}</SectionLabel>

        <div className="mt-8 max-w-3xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("aiHumans.headline")}
          </h2>
          <p className="text-muted-foreground mt-4 text-base leading-relaxed sm:text-lg">
            {t("aiHumans.description")}
          </p>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {(["creativity", "speed", "impact"] as const).map((key) => (
            <div key={key} className="space-y-2">
              <h3 className="font-mono text-xs font-semibold tracking-wider">
                {t(`aiHumans.props.${key}`)}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t(`aiHumans.props.${key}Desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Sponsors */}
      <section className="px-6 py-12 sm:px-12">
        <SectionLabel>
          / {t("sponsors.currentSponsors").toUpperCase()}
        </SectionLabel>

        <div className="mt-8 max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("sponsorPitch.headline")}
          </h2>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed sm:text-base">
            {t("sponsorPitch.description")}
          </p>
        </div>

        {featuredSponsors.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-8">
            {featuredSponsors.map((sponsor) => {
              const logo =
                typeof sponsor.logo === "object" ? sponsor.logo : null;
              return logo?.url ? (
                <a
                  key={sponsor.id}
                  href={sponsor.website ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-60 transition-opacity hover:opacity-100"
                >
                  <Image
                    src={logo.url}
                    alt={sponsor.name}
                    width={120}
                    height={48}
                    className="h-8 w-auto object-contain sm:h-12"
                  />
                </a>
              ) : null;
            })}
          </div>
        )}

        <div className="mt-6 text-right">
          <Link
            href="/sponsors"
            className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider transition-colors"
          >
            {t("sponsorPitch.cta")} →
          </Link>
        </div>
      </section>

      {/* CTA Cards */}
      <section className="px-6 py-12 sm:px-12">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              title: t("join.attend.title"),
              desc: t("join.attend.description"),
              href: session?.user
                ? ("/dashboard/agent" as const)
                : ("/communities" as const),
            },
            {
              title: t("join.challenge.title"),
              desc: t("join.challenge.description"),
              href: "/challenges" as const,
            },
            {
              title: t("join.partner.title"),
              desc: t("join.partner.description"),
              href: "/sponsors" as const,
            },
          ].map((cta) => (
            <Link
              key={cta.title}
              href={cta.href}
              className="group border-border hover:border-foreground/30 flex h-44 flex-col items-center justify-center gap-2 rounded-xl border px-6 text-center transition-colors"
            >
              <span className="group-hover:text-primary text-xl font-semibold">
                {cta.title}
              </span>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {cta.desc}
              </p>
              <ArrowUpRight className="text-muted-foreground group-hover:text-primary h-5 w-5 transition-colors" />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
