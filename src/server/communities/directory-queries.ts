/** Loads the public community directory. Thin DB glue over `directory.ts`. */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Payload, Where } from "payload";

import { communities, spaces } from "@/server/db/schema";
import type { db as _db } from "@/server/db";
import { loadDiscoveryCandidates } from "@/server/communities/discovery-queries";
import {
  buildDirectory,
  type DirectoryCommunity,
  type DirectoryEventRow,
} from "@/server/communities/directory";
import { loadEventSideWhere } from "@/server/events/event-side-where";
import { createTtlMemo } from "@/server/ttl-memo";

type DB = typeof _db;

/** How long one instance serves a directory snapshot before rebuilding. */
const SNAPSHOT_TTL_MS = 60_000;

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
    // Every upcoming event: a community's next event and places must not
    // depend on how many other communities have events.
    pagination: false,
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
async function loadDirectory(
  db: DB,
  payload: Payload,
  opts: { now: Date; locale: "en" | "nl" },
): Promise<DirectoryCommunity[]> {
  const candidates = await loadDiscoveryCandidates(db, opts.now);
  const ids = candidates.map((c) => c.communityId);
  if (ids.length === 0) return [];

  const [factRows, events, roomRows] = await Promise.all([
    db
      .select({
        id: communities.id,
        joinPolicy: communities.joinPolicy,
        createdAt: communities.createdAt,
      })
      .from(communities)
      .where(inArray(communities.id, ids)),
    loadUpcomingEvents(payload, ids, opts.locale, opts.now),
    db
      .select({
        communityId: spaces.communityId,
        n: sql<number>`count(*)::int`,
      })
      .from(spaces)
      .where(
        and(
          inArray(spaces.communityId, ids),
          eq(spaces.kind, "room"),
          eq(spaces.visibility, "public"),
          isNull(spaces.archivedAt),
        ),
      )
      .groupBy(spaces.communityId),
  ]);

  return buildDirectory({
    candidates,
    facts: new Map(factRows.map((r) => [r.id, r])),
    events,
    openRooms: new Map(roomRows.map((r) => [r.communityId, r.n])),
    now: opts.now,
  });
}

const snapshots = createTtlMemo<"en" | "nl", DirectoryCommunity[]>(
  SNAPSHOT_TTL_MS,
);

/**
 * The directory as one snapshot per locale, rebuilt at most once a minute
 * per instance. Search, sort and paging run on the snapshot, so a visitor
 * typing or paging never rebuilds it, and pages of one browse share one
 * order.
 */
export function loadDirectorySnapshot(
  db: DB,
  payload: Payload,
  locale: "en" | "nl",
): Promise<DirectoryCommunity[]> {
  return snapshots.get(locale, () =>
    loadDirectory(db, payload, { now: new Date(), locale }),
  );
}

/**
 * Drops this instance's snapshots, e.g. after a community is created or
 * its listing changes, so its organizer sees the change right away.
 */
export function invalidateDirectorySnapshots(): void {
  snapshots.clear();
}
