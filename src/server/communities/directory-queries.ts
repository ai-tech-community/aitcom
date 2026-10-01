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

/** An event held online, by its format or its location text. */
function isOnline(e: { format?: string | null; location?: unknown }): boolean {
  return e.format === "online" || e.location === "Online";
}

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
      latitude: true,
      longitude: true,
      type: true,
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
            online: isOnline(e),
            // Only a real place has a distance: never an online event
            // (which may keep stale coordinates) or one still "TBA".
            point:
              !isOnline(e) &&
              e.location !== "TBA" &&
              typeof e.latitude === "number" &&
              typeof e.longitude === "number"
                ? { lat: e.latitude, lng: e.longitude }
                : null,
            hackathon: e.type === "hackathon",
          },
        ]
      : [],
  );
}

/** Community ids among `ids` that have at least one matching doc. */
async function communitiesWith(
  payload: Payload,
  collection: "courses" | "challenges" | "jobs",
  ids: readonly string[],
  where: Where[],
): Promise<Set<string>> {
  const { docs } = await payload.find({
    collection,
    where: { and: [{ communityId: { in: [...ids] } }, ...where] },
    pagination: false,
    depth: 0,
    draft: false,
    select: { communityId: true },
  });
  return new Set(docs.flatMap((d) => (d.communityId ? [d.communityId] : [])));
}

/**
 * What the listed communities offer beyond events, by the same rules the
 * public pages use: a course visitors can open (published and public), an
 * active challenge, an open job that has not expired.
 */
async function loadOfferings(
  payload: Payload,
  ids: readonly string[],
  now: Date,
) {
  const [learn, build, work] = await Promise.all([
    communitiesWith(payload, "courses", ids, [
      { status: { equals: "published" } },
      { isPublic: { equals: true } },
    ]),
    communitiesWith(payload, "challenges", ids, [
      { status: { equals: "active" } },
    ]),
    communitiesWith(payload, "jobs", ids, [
      { status: { equals: "active" } },
      {
        or: [
          { expiresAt: { exists: false } },
          { expiresAt: { greater_than: now.toISOString() } },
        ],
      },
    ]),
  ]);
  return { learn, build, work };
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

  const [factRows, events, roomRows, offerings] = await Promise.all([
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
    loadOfferings(payload, ids, opts.now),
  ]);

  return buildDirectory({
    candidates,
    facts: new Map(factRows.map((r) => [r.id, r])),
    events,
    openRooms: new Map(roomRows.map((r) => [r.communityId, r.n])),
    offerings,
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
