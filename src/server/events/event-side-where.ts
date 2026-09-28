import type { Payload, Where } from "payload";
import {
  isEventOver,
  pastEventsQueryCeiling,
  upcomingEventsQueryFloor,
} from "@/lib/event-time";

export type EventSide = "upcoming" | "past";

/** The fields that decide whether an event is over. */
interface BandEvent {
  id: number;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
}

/**
 * The window of stored dates where "over or not" depends on the event's own
 * zone and times (UTC−12 … UTC+14): two days either side of now. Before it
 * every event is over everywhere; from its end on none has started.
 */
export function eventSideBand(now: Date): { floor: string; ceiling: string } {
  return {
    floor: upcomingEventsQueryFloor(now),
    ceiling: pastEventsQueryCeiling(now),
  };
}

/**
 * A database condition for one side of "over" — exact, so a paginated,
 * sorted query can use it directly. Outside the band the stored date
 * decides; inside it, the few events there were judged one by one with
 * `isEventOver` (the rule every event list shares) and are named by id.
 * `band` must hold every event whose date lies in `eventSideBand(now)`
 * (and may leave out ones the caller's other conditions exclude anyway).
 */
export function eventSideWhere(
  side: EventSide,
  band: readonly BandEvent[],
  now: Date,
): Where {
  const { floor, ceiling } = eventSideBand(now);
  const ids = band
    .filter((event) => isEventOver(event, now) === (side === "past"))
    .map((event) => event.id);
  const outside: Where =
    side === "past"
      ? { date: { less_than: floor } }
      : { date: { greater_than_equal: ceiling } };
  return ids.length > 0 ? { or: [outside, { id: { in: ids } }] } : outside;
}

/**
 * Loads the band for `where` (the page's other conditions) and returns the
 * exact condition for `side`. One small extra query: only events stored
 * within two days of now, only the fields the rule reads.
 */
export async function loadEventSideWhere(
  payload: Payload,
  { side, where, now }: { side: EventSide; where: Where[]; now: Date },
): Promise<Where> {
  const { floor, ceiling } = eventSideBand(now);
  const { docs } = await payload.find({
    collection: "events",
    where: {
      and: [
        ...where,
        { date: { greater_than_equal: floor } },
        { date: { less_than: ceiling } },
      ],
    },
    select: { date: true, startTime: true, endTime: true, timezone: true },
    pagination: false,
    depth: 0,
    draft: false,
  });
  return eventSideWhere(side, docs, now);
}
