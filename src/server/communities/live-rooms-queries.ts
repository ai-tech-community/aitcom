/** Loads "Talking now" rooms. Thin DB glue over `live-rooms.ts`. */

import { and, eq, gte, isNull, sql } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import {
  communities,
  conversations,
  messages,
  spaces,
} from "@/server/db/schema";
import {
  LIVE_WINDOW_HOURS,
  type LiveRoomRow,
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
      and(eq(conversations.type, "space"), eq(conversations.spaceId, spaces.id)),
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

const liveRooms = createTtlMemo<"all", LiveRoomRow[]>(LIVE_ROOMS_TTL_MS);

/** "Talking now" rows, rebuilt at most once a minute per instance. */
export function loadLiveRooms(db: DB): Promise<LiveRoomRow[]> {
  return liveRooms.get("all", () => loadLiveRoomRows(db, new Date()));
}

/** Drops this instance's cached rows (tests, or after a listing change). */
export function invalidateLiveRooms(): void {
  liveRooms.clear();
}
