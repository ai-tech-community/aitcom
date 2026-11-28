import type { ReactNode } from "react";
import { CalendarPlus, MapPin, ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EventTimeDisplay } from "@/components/event-time-display";
import { Button } from "@/components/ui/button";
import { EventDateBlock } from "@/components/events/rows/event-date-block";
import type { EventDetailDay } from "./event-detail-when";

export async function EventReservationRail({
  slug,
  ended,
  cancelled,
  day,
  date,
  startTime,
  endTime,
  timezone,
  location,
  region,
  mapHref,
  price,
  deadline,
  registration,
  attendees,
  tools,
  followUp,
  sourceUrl,
}: {
  slug: string;
  ended: boolean;
  cancelled: boolean;
  day: EventDetailDay;
  date: string;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  location: string;
  region: string | null;
  mapHref: string | null;
  price: string | null;
  deadline: string | null;
  registration: ReactNode;
  attendees: ReactNode;
  tools?: ReactNode;
  followUp?: ReactNode;
  sourceUrl: string | null;
}) {
  const [t, te] = await Promise.all([
    getTranslations("redesign.events"),
    getTranslations("events"),
  ]);

  return (
    <aside
      aria-label={t("reservationDetails")}
      className="lg:col-start-2 lg:row-start-1 lg:self-start"
    >
      <div className="border-border bg-card text-card-foreground rounded-xl border">
        <div className="space-y-2 p-3.5 sm:space-y-3 sm:p-5">
          <div className="flex items-start gap-3">
            <EventDateBlock {...day} />
            <div className="min-w-0 space-y-1 pt-0.5">
              <p className="font-mono text-sm font-semibold tabular-nums">
                {day.label}
              </p>
              <EventTimeDisplay
                date={date}
                startTime={startTime}
                endTime={endTime}
                timezone={timezone}
                className="font-mono tabular-nums"
              />
              {startTime ? (
                <p className="text-muted-foreground text-xs break-words">
                  {timezone ? (
                    <span className="font-mono">
                      {timezone.replaceAll("_", " ")}
                    </span>
                  ) : (
                    t("timeZoneUnspecified")
                  )}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-start gap-2.5 text-sm">
            <MapPin
              aria-hidden="true"
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
            />
            <div className="min-w-0">
              <div className="font-medium break-words">{location}</div>
              {region && region !== location ? (
                <div className="text-muted-foreground text-xs">{region}</div>
              ) : null}
              {mapHref ? (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="-ml-2.5 max-sm:min-h-11"
                >
                  <a href={mapHref} target="_blank" rel="noreferrer">
                    {t("viewMap")}
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="border-border space-y-2 border-t border-dashed p-3.5 sm:space-y-3 sm:p-5">
          {price || deadline ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-sm">
              {price ? <span className="font-medium">{price}</span> : null}
              {deadline ? (
                <span className="text-muted-foreground text-xs">
                  {te("registrationCloses", { date: deadline })}
                </span>
              ) : null}
            </div>
          ) : null}
          {registration}
          {followUp}
          {!ended && !cancelled ? (
            <Button asChild variant="outline" className="min-h-11 w-full">
              <a href={`/api/events/${encodeURIComponent(slug)}/ics`}>
                <CalendarPlus aria-hidden="true" />
                {t("addCalendar")}
              </a>
            </Button>
          ) : null}
          {tools}
          {sourceUrl ? (
            <Button asChild variant="ghost" className="min-h-11 w-full">
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                {t("originalEvent")}
                <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
          ) : null}
        </div>
        <div className="border-border border-t p-4 sm:p-5">{attendees}</div>
      </div>
    </aside>
  );
}
