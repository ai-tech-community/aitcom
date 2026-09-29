/**
 * The event organizer (ADR-0038): the one member who runs a native event and
 * alone sees its attendee details. These are the rules for who holds and who
 * may hand over that role; the router and the pages only ask these functions.
 */

export interface OrganizerMembership {
  role: string;
  status: string;
}

export interface OrganizerEvent {
  organizerId?: string | null;
  communityId?: string | null;
}

/** Whether this membership lets someone be an event's organizer. */
export function isEligibleOrganizer(
  membership: OrganizerMembership | null | undefined,
): boolean {
  return membership?.status === "active";
}

/**
 * Whether `actorId` may hand the event to someone else: the community owner
 * always may (it covers an organizer who left and events with none), and the
 * current organizer may while still an active member. Community admins who
 * do not organize the event may not, so the role cannot be taken to see a
 * list someone else is responsible for.
 */
export function canSetEventOrganizer(input: {
  event: OrganizerEvent;
  actorId: string;
  actorMembership: OrganizerMembership | null | undefined;
}): boolean {
  const { event, actorId, actorMembership } = input;
  if (!event.communityId) return false;
  if (!isEligibleOrganizer(actorMembership)) return false;
  if (actorMembership?.role === "owner") return true;
  return !!event.organizerId && event.organizerId === actorId;
}

/** Whether `actorId` may see who organizes the community's events. */
export function canSeeEventOrganizers(
  actorMembership: OrganizerMembership | null | undefined,
): boolean {
  return (
    isEligibleOrganizer(actorMembership) &&
    (actorMembership?.role === "owner" || actorMembership?.role === "admin")
  );
}
