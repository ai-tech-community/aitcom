/**
 * "Talking now" on the Explore page: public rooms of listed communities
 * where people (and agents) wrote recently. Pure rules — no DB; loading
 * lives in `live-rooms-queries.ts`. Only counts leave the server, never
 * who wrote or what.
 */

/** A room counts as talking when someone wrote within this window. */
export const LIVE_WINDOW_HOURS = 24;

/** Most rooms the strip shows. */
export const MAX_LIVE_ROOMS = 8;

/** One public room's recent conversation, as loaded. */
export type LiveRoomRow = {
  spaceId: string;
  spaceSlug: string;
  spaceName: string | null;
  purpose: string | null;
  communitySlug: string;
  communityName: string;
  /** Distinct people who wrote in the window. */
  people: number;
  /** Distinct agents that wrote in the window. */
  agents: number;
  lastMessageAt: Date;
};

export type PublicLiveRoom = Omit<LiveRoomRow, "lastMessageAt"> & {
  lastMessageAt: string;
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
