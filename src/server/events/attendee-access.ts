import { externalEventUrl } from "@/lib/events/event-source";

/**
 * Who may see an event's attendee details (ADR-0038): its organizer, while
 * still an active member of the event's community, for a native event only.
 * Every attendee entry point asks this one function (the list, the CSV,
 * check-in); a denied request is answered NOT_FOUND so the list's existence
 * is never revealed. Co-organizers would be a change here and nowhere else.
 */
export function canViewEventAttendees(input: {
  event: {
    organizerId?: string | null;
    communityId?: string | null;
    sourceUrl?: string | null;
  };
  viewerId: string | null | undefined;
  membership: { status: string } | null | undefined;
}): boolean {
  const { event, viewerId, membership } = input;
  if (!viewerId || !event.organizerId || !event.communityId) return false;
  if (externalEventUrl(event) !== null) return false;
  if (event.organizerId !== viewerId) return false;
  return membership?.status === "active";
}
