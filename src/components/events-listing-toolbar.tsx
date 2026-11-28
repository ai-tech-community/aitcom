"use client";

import { useLocale, useTranslations } from "next-intl";

import { EventsFilterBar } from "@/components/events-filter-bar";
import { UseMyLocationButton } from "@/components/use-my-location-button";
import { cn } from "@/lib/utils";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { Link } from "@/i18n/navigation";

const tabClass = (active: boolean) =>
  `rounded border px-4 py-2 transition-colors ${
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border text-muted-foreground hover:bg-secondary/40"
  }`;

const viewClass = (active: boolean) =>
  `rounded border px-3 py-1.5 transition-colors ${
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border text-muted-foreground hover:bg-secondary/40"
  }`;

export function EventsListingToolbar({
  upcomingHref,
  pastHref,
  gridHref,
  mapHref,
  isPast,
  isMapView,
  visitorCountryCode,
  visitorCountryName,
}: {
  upcomingHref: string;
  pastHref: string;
  gridHref: string;
  mapHref: string;
  isPast: boolean;
  isMapView: boolean;
  visitorCountryCode: string | null;
  visitorCountryName: string | null;
}) {
  const t = useTranslations("events");
  const redesign = isOpenCommunitiesEnabled();
  const tr = useTranslations("redesign.events");
  const locale = useLocale();
  const upper = (value: string) =>
    redesign ? value : value.toLocaleUpperCase(locale);
  const tapTarget = redesign && "inline-flex min-h-11 items-center";

  return (
    <>
      <div
        className={cn(
          "mt-6 flex gap-1",
          redesign ? "text-sm font-medium" : "font-mono text-xs tracking-wider",
        )}
      >
        <Link
          href={upcomingHref as never}
          className={cn(tabClass(!isPast), tapTarget)}
          aria-current={redesign && !isPast ? "page" : undefined}
        >
          {upper(t("filters.upcoming"))}
        </Link>
        <Link
          href={pastHref as never}
          className={cn(tabClass(isPast), tapTarget)}
          aria-current={redesign && isPast ? "page" : undefined}
        >
          {upper(t("filters.past"))}
        </Link>
      </div>

      <EventsFilterBar
        visitorCountryCode={visitorCountryCode}
        visitorCountryName={visitorCountryName}
      />

      <div
        className={cn(
          "mt-4 flex flex-wrap items-center gap-2",
          redesign
            ? "text-sm font-medium [&_button]:min-h-11"
            : "font-mono text-xs tracking-wider",
        )}
      >
        <UseMyLocationButton />
        <Link
          href={gridHref as never}
          className={cn(viewClass(!isMapView), tapTarget)}
          aria-current={redesign && !isMapView ? "page" : undefined}
        >
          {redesign ? tr("agenda") : upper(t("filters.grid"))}
        </Link>
        <Link
          href={mapHref as never}
          className={cn(viewClass(isMapView), tapTarget)}
          aria-current={redesign && isMapView ? "page" : undefined}
        >
          {upper(t("filters.map"))}
        </Link>
      </div>
    </>
  );
}
