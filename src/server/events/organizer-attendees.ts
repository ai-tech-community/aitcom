import { and, eq, isNull } from "drizzle-orm";

import { parseStoredQuestions } from "@/lib/events/registration-questions";
import type { db as Db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";
import { canViewEventAttendees } from "@/server/events/attendee-access";
import {
  loadEventAttendees,
  type EventAttendees,
} from "@/server/events/attendee-details";
import { getPayloadClient } from "@/server/payload";

export interface OrganizerAttendeesView extends EventAttendees {
  event: {
    id: number;
    title: string;
    slug: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    timezone: string | null;
    maxAttendees: number | null;
    isPaid: boolean;
  };
  community: { slug: string; name: string };
  /** The event's current questions, for column headings. */
  questions: { id: string; label: string }[];
}

/**
 * The attendee list as the event organizer sees it (ADR-0038), or null for
 * anyone else — the caller answers null with NOT_FOUND. The one path every
 * attendee surface takes (the page's API, the CSV download), so the access
 * rule and the privacy rule cannot drift between them.
 */
export async function readAttendeesForOrganizer(
  db: typeof Db,
  viewerId: string,
  ref: { id: number } | { slug: string },
): Promise<OrganizerAttendeesView | null> {
  const payload = await getPayloadClient();
  const event =
    "id" in ref
      ? await payload.findByID({
          collection: "events",
          id: ref.id,
          depth: 0,
          disableErrors: true,
        })
      : (
          await payload.find({
            collection: "events",
            where: { slug: { equals: ref.slug } },
            limit: 1,
            depth: 0,
          })
        ).docs[0];
  // Cheap exit before any membership query: most callers are not the organizer.
  if (!event?.communityId || event.organizerId !== viewerId) return null;

  const community = await db.query.communities.findFirst({
    where: and(
      eq(communities.id, event.communityId),
      isNull(communities.deletedAt),
    ),
    columns: { id: true, slug: true, name: true },
  });
  if (!community) return null;

  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, community.id),
      eq(communityMemberships.userId, viewerId),
    ),
    columns: { status: true },
  });
  if (!canViewEventAttendees({ event, viewerId, membership })) return null;

  // Past attendance counts this community's events before this one.
  const { docs: earlier } = await payload.find({
    collection: "events",
    where: {
      and: [
        { communityId: { equals: community.id } },
        { date: { less_than: event.date } },
      ],
    },
    select: { slug: true },
    limit: 0,
    depth: 0,
  });

  const questions = parseStoredQuestions(event.registrationQuestions);
  const { counts, rows } = await loadEventAttendees(
    db,
    { id: event.id, communityId: community.id, questions },
    earlier.map((e) => e.id),
  );

  return {
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
      date: event.date,
      startTime: event.startTime ?? null,
      endTime: event.endTime ?? null,
      timezone: event.timezone ?? null,
      maxAttendees: (event.maxAttendees as number | null) ?? null,
      isPaid: ((event.price as number | null) ?? 0) > 0,
    },
    community: { slug: community.slug, name: community.name },
    questions: questions.map((q) => ({ id: q.id, label: q.label })),
    counts,
    rows,
  };
}
