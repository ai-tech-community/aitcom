import { splitMyEvents } from "@/lib/events/split-my-events";
import { eventStartInstant, upcomingEventsQueryFloor } from "@/lib/event-time";
import { loadMyEventPairs } from "@/server/events/my-event-pairs";

import type {
  NextUpContext,
  NextUpEventItem,
  UpcomingRegistrationStatus,
} from "../types";

/** How many upcoming events Next up shows. */
export const NEXT_UP_EVENT_LIMIT = 3;

/**
 * The member's next registered events, soonest first: the same pairs and the
 * same upcoming rule as the My events tab (`loadMyEventPairs` +
 * `splitMyEvents`). Cancelled events are left out at the query: there is
 * nothing to go to. The date floor only trims old rows; `splitMyEvents`
 * does the exact "not over yet" check in each event's own zone.
 */
export async function loadEventItems(
  ctx: NextUpContext,
): Promise<NextUpEventItem[]> {
  const pairs = await loadMyEventPairs(ctx, {
    userId: ctx.userId,
    locale: ctx.locale,
    where: {
      status: { not_equals: "cancelled" },
      date: { greater_than_equal: upcomingEventsQueryFloor(ctx.now) },
    },
  });

  const { upcoming } = splitMyEvents(pairs, ctx.now);

  return upcoming
    .slice(0, NEXT_UP_EVENT_LIMIT)
    .flatMap(({ registration, event }) => {
      // `upcoming` only holds events with a real start and never attended ones.
      const start = eventStartInstant(event);
      if (!start || registration.status === "attended") return [];
      const startsAt = start.toISOString();
      return [
        {
          kind: "event",
          key: `event:${registration.id}`,
          urgency: { tier: "timeBound", at: startsAt },
          eventId: event.id,
          slug: event.slug,
          title: event.title,
          startsAt,
          registration:
            registration.status satisfies UpcomingRegistrationStatus,
        },
      ];
    });
}
