import { TRPCError } from "@trpc/server";
import { isEventOver } from "@/lib/event-time";

/** The schedule fields that decide whether an event is over. */
export interface CancellableEvent {
  id?: string | number | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
}

export const EVENT_ALREADY_OVER_MESSAGE =
  "This event has already taken place, so it can't be cancelled. Edit it instead if something needs correcting.";

/**
 * Cancelling tells every registrant the event is off; for an event that
 * already happened that is false and confusing. Refuse once the event is
 * over, by the same rule the lists use to call it past (`isEventOver`,
 * judged in the event's own zone).
 */
export function assertEventCancellable(
  event: CancellableEvent,
  now: Date = new Date(),
): void {
  if (isEventOver(event, now)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: EVENT_ALREADY_OVER_MESSAGE,
    });
  }
}
