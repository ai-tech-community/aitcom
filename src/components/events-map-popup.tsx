"use client";

import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatEventDay } from "@/lib/event-time";
import { eventRowKind } from "@/components/events/rows/event-rows";
import { useEventRowLabels } from "@/components/events/rows/use-event-row-labels";
import type { MapEvent } from "./events-map-view";

/**
 * What a map marker's popup says about its event: the event's own day and
 * type in the reader's language (the same words as the event rows), the
 * title as a link, the place and the AIT fit score. Kept apart from the
 * Leaflet map so it renders and tests without a map.
 */
export function EventMapPopup({ event }: { event: MapEvent }) {
  const locale = useLocale();
  const labels = useEventRowLabels();
  const dateTime = event.date.slice(0, 10);
  return (
    <>
      <div className="font-mono text-xs tracking-wider text-neutral-500 uppercase">
        <time dateTime={dateTime}>{formatEventDay(event.date, locale)}</time>
        {" · "}
        {eventRowKind(event.type, labels).label}
      </div>
      <Link
        href={`/events/${event.slug}`}
        className="mt-1 block text-sm font-semibold text-black hover:underline"
      >
        {event.title}
      </Link>
      <div className="mt-1 text-xs text-neutral-600">{event.location}</div>
      {typeof event.aitFitScore === "number" && (
        <div className="mt-1 inline-block rounded bg-black px-1.5 py-0.5 font-mono text-xs text-white">
          AIT {event.aitFitScore}/10
        </div>
      )}
    </>
  );
}
