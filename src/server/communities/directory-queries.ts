/** Loads the public community directory. Thin DB glue over `directory.ts`. */

import { inArray } from "drizzle-orm";
import type { Payload, Where } from "payload";

import { communities } from "@/server/db/schema";
import type { db as _db } from "@/server/db";
import { loadDiscoveryCandidates } from "@/server/communities/discovery-queries";
import {
  buildDirectory,
  type DirectoryCommunity,
  type DirectoryEventRow,
} from "@/server/communities/directory";
import { loadEventSideWhere } from "@/server/events/event-side-where";

type DB = typeof _db;

/** Upcoming events read per request; enough for every community's next few. */
const MAX_UPCOMING_EVENTS = 500;

/**
 * Upcoming public events of the given communities, soonest first. Same
 * rules as the public events page: published, not a discovered (Luma)
 * event, and upcoming in the event's own time zone.
 */
async function loadUpcomingEvents(
  payload: Payload,
  communityIds: readonly string[],
  locale: "en" | "nl",
  now: Date,
): Promise<DirectoryEventRow[]> {
  if (communityIds.length === 0) return [];
  const conditions: Where[] = [
    { status: { equals: "published" } },
    { discoverySource: { not_equals: "luma" } },
    { communityId: { in: [...communityIds] } },
  ];
  conditions.push(
    await loadEventSideWhere(payload, {
      side: "upcoming",
      where: [...conditions],
      now,
    }),
  );
  const { docs } = await payload.find({
    collection: "events",
    where: { and: conditions },
    sort: "date",
    limit: MAX_UPCOMING_EVENTS,
    locale,
    draft: false,
    depth: 0,
    select: {
      slug: true,
      title: true,
      date: true,
      startTime: true,
      timezone: true,
      city: true,
      format: true,
      location: true,
      communityId: true,
    },
  });
  return docs.flatMap((e) =>
    e.communityId
      ? [
          {
            communityId: e.communityId,
            slug: e.slug ?? String(e.id),
            title: e.title,
            date: e.date,
            startTime: e.startTime ?? null,
            timezone: e.timezone ?? null,
            city: e.city ?? null,
            online: e.format === "online" || e.location === "Online",
          },
        ]
      : [],
  );
}

/** Every listed community with its public signals and next event. */
export async function loadDirectory(
  db: DB,
  payload: Payload,
  opts: { now: Date; locale: "en" | "nl" },
): Promise<DirectoryCommunity[]> {
  const candidates = await loadDiscoveryCandidates(db, opts.now);
  const ids = candidates.map((c) => c.communityId);
  if (ids.length === 0) return [];

  const [factRows, events] = await Promise.all([
    db
      .select({
        id: communities.id,
        joinPolicy: communities.joinPolicy,
        createdAt: communities.createdAt,
      })
      .from(communities)
      .where(inArray(communities.id, ids)),
    loadUpcomingEvents(payload, ids, opts.locale, opts.now),
  ]);

  return buildDirectory({
    candidates,
    facts: new Map(factRows.map((r) => [r.id, r])),
    events,
    now: opts.now,
  });
}
