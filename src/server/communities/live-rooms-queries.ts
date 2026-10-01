/** Loads the Explore page's rooms. Thin DB glue over `live-rooms.ts`. */

import { and, asc, desc, eq, gte, isNull, notInArray, sql } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import {
  communities,
  conversations,
  messages,
  spaceMemberships,
  spaces,
} from "@/server/db/schema";
import {
  LIVE_WINDOW_HOURS,
  MAX_QUIET_ROOMS,
  talkingRoomIds,
  type LiveRoomRow,
  type QuietRoomRow,
} from "@/server/communities/live-rooms";
import { createTtlMemo } from "@/server/ttl-memo";

type DB = typeof _db;

/** How long one instance serves the list before asking again. */
const LIVE_ROOMS_TTL_MS = 60_000;

/**
 * Public, unarchived rooms of listed communities with at least one message
 * in the window, with distinct people / agents who wrote and the last
 * message time. One grouped query.
 */
async function loadLiveRoomRows(db: DB, now: Date): Promise<LiveRoomRow[]> {
  const since = new Date(now.getTime() - LIVE_WINDOW_HOURS * 60 * 60 * 1000);
  const rows = await db
    .select({
      spaceId: spaces.id,
      spaceSlug: spaces.slug,
      spaceName: spaces.name,
      communitySlug: communities.slug,
      communityName: communities.name,
      people: sql<number>`(count(distinct ${messages.senderId}) filter (where ${messages.senderType} = 'human'))::int`,
      agents: sql<number>`(count(distinct ${messages.senderId}) filter (where ${messages.senderType} = 'agent'))::int`,
      lastMessageAt: sql<string>`max(${messages.createdAt})`,
    })
    .from(spaces)
    .innerJoin(communities, eq(communities.id, spaces.communityId))
    .innerJoin(
      conversations,
      and(
        eq(conversations.type, "space"),
        eq(conversations.spaceId, spaces.id),
      ),
    )
    .innerJoin(
      messages,
      and(
        eq(messages.conversationId, conversations.id),
        gte(messages.createdAt, since),
      ),
    )
    .where(
      and(
        eq(spaces.kind, "room"),
        eq(spaces.visibility, "public"),
        isNull(spaces.archivedAt),
        eq(communities.isListedInDirectory, true),
        isNull(communities.deletedAt),
      ),
    )
    .groupBy(
      spaces.id,
      spaces.slug,
      spaces.name,
      communities.slug,
      communities.name,
    );
  return rows.map((r) => ({
    ...r,
    lastMessageAt: new Date(r.lastMessageAt),
  }));
}

/**
 * The quiet pick: public, unarchived rooms of listed communities that are
 * not talking, biggest first (active members), then newest — ordered and
 * limited in SQL, so the cost follows what the page shows, not how many
 * rooms exist.
 */
async function loadQuietRoomRows(
  db: DB,
  talkingIds: readonly string[],
): Promise<QuietRoomRow[]> {
  const members = sql<number>`count(${spaceMemberships.id})::int`;
  return db
    .select({
      spaceId: spaces.id,
      spaceSlug: spaces.slug,
      spaceName: spaces.name,
      purpose: spaces.purpose,
      communitySlug: communities.slug,
      communityName: communities.name,
      members,
    })
    .from(spaces)
    .innerJoin(communities, eq(communities.id, spaces.communityId))
    .leftJoin(
      spaceMemberships,
      and(
        eq(spaceMemberships.spaceId, spaces.id),
        eq(spaceMemberships.status, "active"),
      ),
    )
    .where(
      and(
        eq(spaces.kind, "room"),
        eq(spaces.visibility, "public"),
        isNull(spaces.archivedAt),
        eq(communities.isListedInDirectory, true),
        isNull(communities.deletedAt),
        talkingIds.length > 0
          ? notInArray(spaces.id, [...talkingIds])
          : undefined,
      ),
    )
    .groupBy(
      spaces.id,
      spaces.slug,
      spaces.name,
      spaces.purpose,
      spaces.createdAt,
      communities.slug,
      communities.name,
    )
    .orderBy(desc(members), desc(spaces.createdAt), asc(spaces.id))
    .limit(MAX_QUIET_ROOMS);
}

type SquareRoomRows = { live: LiveRoomRow[]; quiet: QuietRoomRow[] };

const squareRoomRows = createTtlMemo<"all", SquareRoomRows>(LIVE_ROOMS_TTL_MS);

/** The square's rooms, rebuilt at most once a minute per instance. */
export function loadSquareRoomRows(db: DB): Promise<SquareRoomRows> {
  return squareRoomRows.get("all", async () => {
    const live = await loadLiveRoomRows(db, new Date());
    const quiet = await loadQuietRoomRows(db, talkingRoomIds(live));
    return { live, quiet };
  });
}

/**
 * Drops this instance's cached rooms. Called when a room is created,
 * renamed, made public or private, archived or restored, and when a
 * community's listing changes — so a room that stops being public leaves
 * the page at once on this instance (others follow within a minute).
 */
export function invalidateSquareRooms(): void {
  squareRoomRows.clear();
}
