import { useTranslations } from "next-intl";
import { FeaturedCommunities } from "@/components/home/featured-communities/featured-communities";
import { LatestNews } from "@/components/home/latest-news/latest-news";
import type { HomeNewsItem } from "@/server/news/home";
import { UpcomingEvents } from "@/components/home/upcoming-events/upcoming-events";
import { RecentGatherings } from "@/components/home/recent-gatherings/recent-gatherings";
import { HomeSponsors } from "@/components/home/sponsors/home-sponsors";
import { HomeMagazines } from "@/components/home/home-magazines";
import { CREATE_COMMUNITY_HREF } from "@/components/communities/create-community-link";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { EventRowInput } from "@/components/events/rows/event-rows";
import type { HomeSponsor } from "@/components/home/sponsors/home-sponsor";
import {
  pickHomeCommunities,
  type FeaturedCommunityCard,
} from "@/server/communities/featured";
import type { MagazineCard } from "@/server/magazines/reading";

/** DOM and keyboard order match the single-column mobile layout. */
export const HOME_SECTION_ORDER = [
  "featured-communities",
  "upcoming-events",
  "latest-news",
  "magazines",
  "recent-gatherings",
  "sponsors",
  "organizers",
] as const;

export type HomeSectionId = (typeof HOME_SECTION_ORDER)[number];

export interface HomeSectionsProps {
  featuredCommunities: FeaturedCommunityCard[];
  upcomingEvents: readonly EventRowInput[];
  recentEvents: readonly EventRowInput[];
  latestNews?: readonly HomeNewsItem[];
  magazines?: readonly MagazineCard[];
  sponsors: readonly HomeSponsor[];
  now?: Date;
}

/** Already-loaded content in; responsive discovery sections out. */
export function HomeSections({
  featuredCommunities,
  upcomingEvents,
  latestNews = [],
  magazines = [],
  recentEvents,
  sponsors,
  now,
}: HomeSectionsProps) {
  const t = useTranslations("homeDiscovery");
  const communities = pickHomeCommunities(featuredCommunities);
  const paired = communities.length > 0 && latestNews.length > 0;
  return (
    <>
      <div className="grid gap-y-10 px-6 py-10 sm:px-12 lg:grid-cols-12 lg:gap-x-10 lg:gap-y-12">
        {communities.length > 0 && (
          <div
            data-section="featured-communities"
            className={`min-w-0 lg:row-start-1 ${paired ? "lg:col-span-8" : "lg:col-span-12"}`}
          >
            <FeaturedCommunities communities={communities} embedded />
          </div>
        )}
        <div
          data-section="upcoming-events"
          className={`min-w-0 lg:col-span-12 ${communities.length || latestNews.length ? "lg:row-start-2" : ""}`}
        >
          <UpcomingEvents events={upcomingEvents} now={now} embedded />
        </div>
        {latestNews.length > 0 && (
          <div
            data-section="latest-news"
            className={`min-w-0 lg:row-start-1 ${paired ? "lg:col-span-4 lg:col-start-9" : "lg:col-span-12"}`}
          >
            <LatestNews items={latestNews.slice(0, 4)} embedded />
          </div>
        )}
      </div>
      {magazines.length > 0 && (
        <div data-section="magazines" className="contents">
          <HomeMagazines magazines={magazines} />
        </div>
      )}
      {recentEvents.length > 0 && (
        <div data-section="recent-gatherings" className="contents">
          <RecentGatherings events={recentEvents} now={now} />
        </div>
      )}
      {sponsors.length > 0 && (
        <div data-section="sponsors" className="contents">
          <HomeSponsors sponsors={sponsors} />
        </div>
      )}
      <section
        data-section="organizers"
        aria-labelledby="home-organizers-title"
        className="border-border mx-6 my-10 flex flex-col items-start gap-5 border-t pt-8 sm:mx-12 md:flex-row md:items-center md:justify-between"
      >
        <div>
          <h2
            id="home-organizers-title"
            className="text-2xl font-semibold tracking-tight"
          >
            {t("organizers")}
          </h2>
          <p className="text-muted-foreground mt-2 max-w-prose text-sm">
            {t("organizersIntro")}
          </p>
        </div>
        <Button asChild variant="ink" className="shrink-0">
          <Link href={CREATE_COMMUNITY_HREF}>{t("createCommunity")}</Link>
        </Button>
      </section>
    </>
  );
}
