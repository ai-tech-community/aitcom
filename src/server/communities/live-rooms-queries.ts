/** Loads the Explore page's rooms. Thin DB glue over `live-rooms.ts`. */

import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";

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
  type LiveRoomRow,
  type PublicRoomRow,
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
      purpose: spaces.purpose,
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
      spaces.purpose,
      communities.slug,
      communities.name,
    );
  return rows.map((r) => ({
    ...r,
    lastMessageAt: new Date(r.lastMessageAt),
  }));
}

/** Every public, unarchived room of a listed community, with its members. */
async function loadPublicRoomRows(db: DB): Promise<PublicRoomRow[]> {
  const rooms = await db
    .select({
      spaceId: spaces.id,
      spaceSlug: spaces.slug,
      spaceName: spaces.name,
      purpose: spaces.purpose,
      communitySlug: communities.slug,
      communityName: communities.name,
      createdAt: spaces.createdAt,
    })
    .from(spaces)
    .innerJoin(communities, eq(communities.id, spaces.communityId))
    .where(
      and(
        eq(spaces.kind, "room"),
        eq(spaces.visibility, "public"),
        isNull(spaces.archivedAt),
        eq(communities.isListedInDirectory, true),
        isNull(communities.deletedAt),
      ),
    );
  if (rooms.length === 0) return [];
  // Grouped count (not a correlated subquery; see the spaces router).
  const counts = await db
    .select({
      spaceId: spaceMemberships.spaceId,
      n: sql<number>`count(*)::int`,
    })
    .from(spaceMemberships)
    .where(
      and(
        inArray(
          spaceMemberships.spaceId,
          rooms.map((r) => r.spaceId),
        ),
        eq(spaceMemberships.status, "active"),
      ),
    )
    .groupBy(spaceMemberships.spaceId);
  const byId = new Map(counts.map((c) => [c.spaceId, c.n]));
  return rooms.map((r) => ({ ...r, members: byId.get(r.spaceId) ?? 0 }));
}

type SquareRoomRows = { publicRooms: PublicRoomRow[]; live: LiveRoomRow[] };

const squareRoomRows = createTtlMemo<"all", SquareRoomRows>(LIVE_ROOMS_TTL_MS);

/** Public rooms and their recent talk, rebuilt at most once a minute per instance. */
export function loadSquareRoomRows(db: DB): Promise<SquareRoomRows> {
  return squareRoomRows.get("all", async () => {
    const [publicRooms, live] = await Promise.all([
      loadPublicRoomRows(db),
      loadLiveRoomRows(db, new Date()),
    ]);
    return { publicRooms, live };
  });
}

/** Drops this instance's cached rows (tests, or after a listing change). */
export function invalidateSquareRooms(): void {
  squareRoomRows.clear();
}
