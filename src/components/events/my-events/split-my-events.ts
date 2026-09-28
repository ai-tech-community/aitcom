import {
  eventStartInstant,
  isEventOver,
  upcomingEvents,
} from "@/lib/event-time";

/** The event fields the split reads; the rest rides along untouched. */
interface MyEventFields {
  id: string | number;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
}

/** A member's registration paired with the event it is for. */
export interface MyEventPair<E extends MyEventFields = MyEventFields> {
  registration: { status: string };
  event: E;
}

/** Latest real start first; unknown starts (corrupt dates) last. */
function byStartDescending(a: MyEventFields, b: MyEventFields): number {
  const as = eventStartInstant(a)?.getTime() ?? -Infinity;
  const bs = eventStartInstant(b)?.getTime() ?? -Infinity;
  if (as !== bs) return bs - as;
  return String(b.id).localeCompare(String(a.id));
}

/**
 * A member's events split the way the dashboard shows them, judged in each
 * event's own zone (the rule every event list shares, see `isEventOver`):
 *
 * - upcoming: not over yet and not already attended, soonest start first.
 *   An event later today stays here after 00:00 UTC.
 * - past: over, or marked attended (an organiser can check someone in
 *   while the event still runs), latest start first.
 */
export function splitMyEvents<P extends MyEventPair>(
  pairs: readonly P[],
  now: Date = new Date(),
): { upcoming: P[]; past: P[] } {
  const attended = (pair: P) => pair.registration.status === "attended";
  const upcoming = upcomingEvents(
    pairs
      .filter((pair) => !attended(pair))
      .map((pair) => ({ ...pair.event, pair })),
    now,
  ).map(({ pair }) => pair);
  const past = pairs
    .filter((pair) => attended(pair) || isEventOver(pair.event, now))
    .sort((a, b) => byStartDescending(a.event, b.event));
  return { upcoming, past };
}
