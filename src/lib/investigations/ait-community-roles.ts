import { HUB_COMMUNITY_PATH } from "@/lib/join-path";
import { HUB_FORUM_PATH } from "@/server/communities/forum-scope";

export const AIT_COMMUNITY_ROLES_PATH = "/roles";

export const AIT_COMMUNITY_ROLES_H1 = "AIT Community roles";

export const AIT_COMMUNITY_ROLES_META =
  "Four Hub seats. Empty seats can be claimed. Filled seats are term-bound and approved off-tree.";

export const AIT_COMMUNITY_ROLES_JOIN_HREF =
  "https://www.aitcommunity.org/en/join?utm_source=roles&utm_medium=web&utm_campaign=roles";

/** Live Hub Welcome thread. Do not invent another slug. */
export const HUB_WELCOME_THREAD_PATH = `${HUB_FORUM_PATH}/welcome-start-here-hub-join-guides-1788790840883`;

/** Hub People directory — existing members surface, not a fake DM. */
export const HUB_PEOPLE_PATH = `${HUB_COMMUNITY_PATH}/members`;

/** Hub DM inbox. Guests land on Join first; this is the post-join path. */
export const HUB_DM_PATH = "/messages";

export const SEAT_TERM_DAYS = 90;
export const SEAT_TERM_WARNING_DAYS = 14;

export const SEAT_IDS = [
  "hub-host",
  "awesome-oss-curator",
  "outreach-campus",
  "agent-pair-challenger",
] as const;

export type SeatId = (typeof SEAT_IDS)[number];

export type SeatRecord = {
  id: SeatId;
  holderName: string | null;
  agentName: string | null;
  /** Frozen Approve timestamp. Empty seats stay null. */
  approvedAt: string | null;
  /** Shared by human + agent on the same seat. Empty seats stay null. */
  termEndsAt: string | null;
};

export type ResolvedSeat = {
  id: SeatId;
  empty: boolean;
  holderName: string | null;
  agentName: string | null;
  approvedAt: string | null;
  termEndsAt: string | null;
  daysLeft: number | null;
  urgent: boolean;
};

/** Approve-as-now for the v1 Outreach seat (Ops lock: Reese Quinn). */
export const OUTREACH_APPROVED_AT = "2026-09-15T00:00:00.000Z";

export function addUtcDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function termEndsAtFromApprove(
  approvedAt: string,
  days = SEAT_TERM_DAYS,
): string {
  return addUtcDays(approvedAt, days);
}

export const OUTREACH_TERM_ENDS_AT =
  termEndsAtFromApprove(OUTREACH_APPROVED_AT);

export const AIT_COMMUNITY_ROLE_SEATS: readonly SeatRecord[] = [
  {
    id: "hub-host",
    holderName: null,
    agentName: null,
    approvedAt: null,
    termEndsAt: null,
  },
  {
    id: "awesome-oss-curator",
    holderName: null,
    agentName: null,
    approvedAt: null,
    termEndsAt: null,
  },
  {
    id: "outreach-campus",
    holderName: "Reese Quinn",
    agentName: null,
    approvedAt: OUTREACH_APPROVED_AT,
    termEndsAt: OUTREACH_TERM_ENDS_AT,
  },
  {
    id: "agent-pair-challenger",
    holderName: null,
    agentName: null,
    approvedAt: null,
    termEndsAt: null,
  },
];

export function daysLeftUntil(termEndsAt: string, now: Date): number {
  const ms = new Date(termEndsAt).getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function resolveSeat(
  seat: SeatRecord,
  now: Date = new Date(),
): ResolvedSeat {
  if (!seat.holderName || !seat.termEndsAt) {
    return emptySeat(seat.id);
  }

  const daysLeft = daysLeftUntil(seat.termEndsAt, now);
  if (daysLeft <= 0) {
    return emptySeat(seat.id);
  }

  return {
    id: seat.id,
    empty: false,
    holderName: seat.holderName,
    agentName: seat.agentName,
    approvedAt: seat.approvedAt,
    termEndsAt: seat.termEndsAt,
    daysLeft,
    urgent: daysLeft <= SEAT_TERM_WARNING_DAYS,
  };
}

export function resolveSeats(
  seats: readonly SeatRecord[] = AIT_COMMUNITY_ROLE_SEATS,
  now: Date = new Date(),
): ResolvedSeat[] {
  return seats.map((seat) => resolveSeat(seat, now));
}

function emptySeat(id: SeatId): ResolvedSeat {
  return {
    id,
    empty: true,
    holderName: null,
    agentName: null,
    approvedAt: null,
    termEndsAt: null,
    daysLeft: null,
    urgent: false,
  };
}
