import { splitMyEvents } from "@/lib/events/split-my-events";
import {
  eventEndInstant,
  eventStartInstant,
  upcomingEventsQueryFloor,
} from "@/lib/event-time";
import { loadMyEventPairs } from "@/server/events/my-event-pairs";

import type {
  NextUpContext,
  NextUpEventItem,
  UpcomingRegistrationStatus,
} from "../types";

/** How many upcoming events Next up shows. */
export const NEXT_UP_EVENT_LIMIT = 3;

/**
 * The member's next registered events, soonest first (one already running
 * comes first and is marked `happeningNow`): the same pairs and the
 * same upcoming rule as the My events tab (`loadMyEventPairs` +
 * `splitMyEvents`, which also leave out draft, rejected and cancelled
 * events). The date floor only trims old rows; `splitMyEvents` does the
 * exact "not over yet" check in each event's own zone.
 */
export async function loadEventItems(
  ctx: NextUpContext,
): Promise<NextUpEventItem[]> {
  const pairs = await loadMyEventPairs(ctx, {
    userId: ctx.userId,
    locale: ctx.locale,
    where: { date: { greater_than_equal: upcomingEventsQueryFloor(ctx.now) } },
  });

  const { upcoming } = splitMyEvents(pairs, ctx.now);

  return upcoming
    .slice(0, NEXT_UP_EVENT_LIMIT)
    .flatMap(({ registration, event }) => {
      // `upcoming` only holds events with a real start and never attended ones.
      const start = eventStartInstant(event);
      if (!start || registration.status === "attended") return [];
      const startsAt = start.toISOString();
      // Upcoming means "not over yet", so one that has started is running.
      const happeningNow = start.getTime() <= ctx.now.getTime();
      return [
        {
          kind: "event",
          key: `event:${registration.id}`,
          urgency: { tier: "timeBound", at: startsAt },
          eventId: event.id,
          slug: event.slug,
          title: event.title,
          startsAt,
          endsAt: eventEndInstant(event)?.toISOString() ?? null,
          allDay: !event.startTime?.trim(),
          happeningNow,
          registration:
            registration.status satisfies UpcomingRegistrationStatus,
        },
      ];
    });
}
