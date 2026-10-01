"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { CommunityStreet } from "./community-street";
import type { StreetHouse } from "./community-street-scene";
import {
  ActivityLine,
  JoinPolicyLabel,
  NextEventLine,
  type DirectoryItem,
} from "./community-signals";
import { squareQueryInput } from "./directory-params";

const STREET_BOX =
  "border-border h-56 overflow-hidden rounded-xl border sm:h-72";

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
 * "On the square now": the most active communities as houses on a street
 * — lit windows for people active recently, a flag for an event coming up,
 * people out front for members. Pointing at a house names it and its
 * facts in the caption; clicking opens it.
 */
export function DiscoverSquare({ className }: { className?: string }) {
  const t = useTranslations("communities.discover");
  const locale = useLocale() as "en" | "nl";
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const query = api.communities.directory.useQuery(squareQueryInput(locale));
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
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

  // No square without houses. The grid below reads the same directory, so
  // its empty and error states speak once for the page.
  if (query.isError || (!query.isLoading && items.length === 0)) return null;

  return (
    <section aria-labelledby="square-title" className={className}>
      <SectionLabel id="square-title" className="mb-4">
        {t("squareTitle")}
      </SectionLabel>
      {query.isLoading ? (
        <Skeleton className={STREET_BOX} />
      ) : (
        <CommunityStreet
          houses={houses}
          activeSlug={activeSlug}
          onActiveChange={setActiveSlug}
          className={STREET_BOX}
        />
      )}
      <div aria-hidden="true" className="mt-3 min-h-6">
        <StreetCaption community={active} />
      </div>
    </section>
  );
}
