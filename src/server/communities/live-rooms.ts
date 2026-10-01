/**
 * The rooms on the Explore page: public rooms of listed communities —
 * "Talking now" (people or agents wrote recently) and the quiet ones.
 * Pure rules — no DB; loading lives in `live-rooms-queries.ts`. Only
 * counts leave the server, never who wrote or what.
 */

/** A room counts as talking when someone wrote within this window. */
export const LIVE_WINDOW_HOURS = 24;

/** Most talking rooms the page lists. */
export const MAX_LIVE_ROOMS = 8;

/** Most quiet rooms the page lists under "Open rooms". */
export const MAX_QUIET_ROOMS = 8;

/** One public room's recent conversation, as loaded. */
export type LiveRoomRow = {
  spaceId: string;
  spaceSlug: string;
  spaceName: string | null;
  communitySlug: string;
  communityName: string;
  /** Distinct people who wrote in the window. */
  people: number;
  /** Distinct agents that wrote in the window. */
  agents: number;
  lastMessageAt: Date;
};

/**
 * A public room nobody wrote in during the window, as loaded: already the
 * page's pick (biggest first, then newest), ordered and limited in SQL.
 */
export type QuietRoomRow = {
  spaceId: string;
  spaceSlug: string;
  spaceName: string | null;
  /** What the room is for, as its owner wrote it. */
  purpose: string | null;
  communitySlug: string;
  communityName: string;
  /** Active room members. */
  members: number;
};

export type PublicLiveRoom = Omit<LiveRoomRow, "lastMessageAt"> & {
  lastMessageAt: string;
};

export type SquareRooms = {
  talking: PublicLiveRoom[];
  /** Public rooms nobody wrote in during the window: a door to knock on. */
  quiet: QuietRoomRow[];
};

/**
 * The rooms to show: someone wrote, most recent conversation first, then
 * the busier room, then a stable id order.
 */
export function rankLiveRooms(
  rows: readonly LiveRoomRow[],
  limit: number = MAX_LIVE_ROOMS,
): PublicLiveRoom[] {
  return rows
    .filter((r) => r.people + r.agents > 0)
    .sort(
      (a, b) =>
        b.lastMessageAt.getTime() - a.lastMessageAt.getTime() ||
        b.people + b.agents - (a.people + a.agents) ||
        (a.spaceId < b.spaceId ? -1 : a.spaceId > b.spaceId ? 1 : 0),
    )
    .slice(0, Math.max(0, limit))
    .map((r) => ({ ...r, lastMessageAt: r.lastMessageAt.toISOString() }));
}

/** The ids of rooms that count as talking, kept out of "quiet". */
export function talkingRoomIds(rows: readonly LiveRoomRow[]): string[] {
  return rows.filter((r) => r.people + r.agents > 0).map((r) => r.spaceId);
}

/**
 * The rooms on the square: talking now, then the quiet pick. A room never
 * shows in both, and each quiet room carries only what the page shows.
 */
export function squareRooms(
  live: readonly LiveRoomRow[],
  quiet: readonly QuietRoomRow[],
): SquareRooms {
  const talking = new Set(talkingRoomIds(live));
  return {
    talking: rankLiveRooms(live),
    quiet: quiet
      .filter((r) => !talking.has(r.spaceId))
      .slice(0, MAX_QUIET_ROOMS)
      .map((r) => ({
        spaceId: r.spaceId,
        spaceSlug: r.spaceSlug,
        spaceName: r.spaceName,
        purpose: r.purpose,
        communitySlug: r.communitySlug,
        communityName: r.communityName,
        members: r.members,
      })),
  };
}
