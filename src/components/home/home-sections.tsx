import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { FeaturedCommunities } from "@/components/home/featured-communities/featured-communities";
import { UpcomingEvents } from "@/components/home/upcoming-events/upcoming-events";
import { HomeCrawlDoors } from "@/components/home/home-crawl-doors";
import { WhatWeDo } from "@/components/home/what-we-do/what-we-do";
import { RecentGatherings } from "@/components/home/recent-gatherings/recent-gatherings";
import { HomeSponsors } from "@/components/home/sponsors/home-sponsors";
import { HomeClosingSquare } from "@/components/home/closing-square/home-closing-square";
import type { EventRowInput } from "@/components/home/event-rows/event-rows";
import type { HomeSponsor } from "@/components/home/sponsors/home-sponsor";
import type { FeaturedCommunityCard } from "@/server/communities/featured";

/** Every section below the hero and stats, in page order. */
export const HOME_SECTION_ORDER = [
  "featured-communities",
  "upcoming-events",
  "start-here",
  "what-we-do",
  "recent-gatherings",
  "sponsors",
  "closing-square",
] as const;

export type HomeSectionId = (typeof HOME_SECTION_ORDER)[number];

export interface HomeSectionsProps {
  featuredCommunities: FeaturedCommunityCard[];
  upcomingEvents: readonly EventRowInput[];
  recentEvents: readonly EventRowInput[];
  sponsors: readonly HomeSponsor[];
  signedIn: boolean;
  now?: Date;
}

/**
 * The homepage below the hero, as already-loaded data in and sections out.
 * The page (an async server component that reads Payload and the database)
 * only fetches; this component owns which sections appear and in what
 * order, so the order can be tested by rendering it. Each section sits in a
 * `display: contents` wrapper tagged `data-section`, so the tag adds no box
 * and a section that renders nothing (no featured communities, no past
 * gatherings, a signed-in member's "start here") leaves no gap.
 */
export function HomeSections({
  featuredCommunities,
  upcomingEvents,
  recentEvents,
  sponsors,
  signedIn,
  now,
}: HomeSectionsProps) {
  const doors = useTranslations("hubDoors");
  const sections: Record<HomeSectionId, ReactNode> = {
    "featured-communities":
      featuredCommunities.length > 0 ? (
        <FeaturedCommunities communities={featuredCommunities} />
      ) : null,
    "upcoming-events": <UpcomingEvents events={upcomingEvents} now={now} />,
    "start-here": <HomeCrawlDoors t={doors} signedIn={signedIn} />,
    "what-we-do": <WhatWeDo />,
    "recent-gatherings": <RecentGatherings events={recentEvents} now={now} />,
    sponsors: <HomeSponsors sponsors={sponsors} />,
    "closing-square": <HomeClosingSquare />,
  };
  return (
    <>
      {HOME_SECTION_ORDER.map((id) => (
        <div key={id} data-section={id} className="contents">
          {sections[id]}
        </div>
      ))}
    </>
  );
}
