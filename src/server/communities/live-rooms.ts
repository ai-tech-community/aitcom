/**
 * The rooms on the Explore page: public rooms of listed communities —
 * "Talking now" (people or agents wrote recently) and the quiet ones.
 * Pure rules — no DB; loading lives in `live-rooms-queries.ts`. Only
 * counts leave the server, never who wrote or what.
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

/** Most quiet rooms the side panel lists under "Talking now". */
export const MAX_QUIET_ROOMS = 8;

/** A public room of a listed community, whether or not it talked. */
export type PublicRoomRow = {
  spaceId: string;
  spaceSlug: string;
  spaceName: string | null;
  purpose: string | null;
  communitySlug: string;
  communityName: string;
  /** Active room members. */
  members: number;
  createdAt: Date;
};

export type PublicQuietRoom = Omit<PublicRoomRow, "createdAt">;

export type SquareRooms = {
  talking: PublicLiveRoom[];
  /** Public rooms nobody wrote in during the window: a door to knock on. */
  quiet: PublicQuietRoom[];
  /** All quiet rooms, also those beyond the list. */
  quietTotal: number;
};

/**
 * The rooms on the square: the ones talking now, then the quiet ones
 * (biggest first, then newest), so the panel always has a door to open.
 */
export function squareRooms(
  publicRooms: readonly PublicRoomRow[],
  live: readonly LiveRoomRow[],
  limits: { talking?: number; quiet?: number } = {},
): SquareRooms {
  const talking = rankLiveRooms(live, limits.talking ?? MAX_LIVE_ROOMS);
  const talkingIds = new Set(
    live.filter((r) => r.people + r.agents > 0).map((r) => r.spaceId),
  );
  const quietAll = publicRooms
    .filter((r) => !talkingIds.has(r.spaceId))
    .sort(
      (a, b) =>
        b.members - a.members ||
        b.createdAt.getTime() - a.createdAt.getTime() ||
        (a.spaceId < b.spaceId ? -1 : a.spaceId > b.spaceId ? 1 : 0),
    );
  return {
    talking,
    quiet: quietAll
      .slice(0, Math.max(0, limits.quiet ?? MAX_QUIET_ROOMS))
      .map(({ createdAt: _createdAt, ...room }) => room),
    quietTotal: quietAll.length,
  };
}
