/**
 * The public community directory (Explore page). Pure rules — no DB: what a
 * listed community shows, how search and the place filter match, how the
 * sorts order, and which places the filter offers. Loading lives in
 * `directory-queries.ts`.
 */

import type { CommunityCandidate } from "@/server/communities/discovery";
import { livenessScore } from "@/server/communities/discovery";

export const DIRECTORY_SORTS = ["active", "newest", "largest"] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

export type JoinPolicy = "open" | "invite_only" | "approval_required";

/** The place key for events held online; every other key is a city name. */
export const ONLINE_PLACE = "online";

/** A community counts as new for this long after it was created. */
export const NEW_FOR_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The soonest upcoming public event of a community. */
export type DirectoryNextEvent = {
  slug: string;
  title: string;
  /** ISO date-time as stored (the event's day). */
  date: string;
  startTime: string | null;
  timezone: string | null;
  city: string | null;
  online: boolean;
};

/** An upcoming public event reduced to what the directory reads. */
export type DirectoryEventRow = DirectoryNextEvent & { communityId: string };

export type DirectoryCommunity = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  joinPolicy: JoinPolicy;
  createdAt: Date;
  memberCount: number;
  /** Distinct people active in the discovery window. */
  activeRecently: number;
  newJoins: number;
  /** Liveness ranking score (see `livenessScore`). */
  score: number;
  isNew: boolean;
  /** Public rooms anyone can look into. */
  openRooms: number;
  nextEvent: DirectoryNextEvent | null;
  /** Place keys of all upcoming events: city names and/or `ONLINE_PLACE`. */
  places: string[];
};

export type DirectoryPlace = { key: string; communities: number };

/** Case- and accent-insensitive comparison key. */
export function foldText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en")
    .trim();
}

export function isNewCommunity(createdAt: Date, now: Date): boolean {
  const age = now.getTime() - createdAt.getTime();
  return age >= 0 && age < NEW_FOR_DAYS * DAY_MS;
}

/** The place key an event counts under, or null when it names none. */
export function placeOf(event: Pick<DirectoryEventRow, "city" | "online">) {
  if (event.online) return ONLINE_PLACE;
  const city = event.city?.trim();
  if (!city) return null;
  return city;
}

/**
 * Joins discovery candidates with their row facts and upcoming events.
 * `events` must be sorted soonest first; the first one per community is
 * its next event.
 */
export function buildDirectory(opts: {
  candidates: readonly CommunityCandidate[];
  facts: ReadonlyMap<string, { joinPolicy: JoinPolicy; createdAt: Date }>;
  events: readonly DirectoryEventRow[];
  /** Public room count per community id (absent = none). */
  openRooms?: ReadonlyMap<string, number>;
  now: Date;
}): DirectoryCommunity[] {
  const eventsByCommunity = new Map<string, DirectoryEventRow[]>();
  for (const e of opts.events) {
    const list = eventsByCommunity.get(e.communityId) ?? [];
    list.push(e);
    eventsByCommunity.set(e.communityId, list);
  }

  return opts.candidates.flatMap((c) => {
    const facts = opts.facts.get(c.communityId);
    if (!facts) return [];
    const upcoming = eventsByCommunity.get(c.communityId) ?? [];
    const first = upcoming[0];
    const places = [
      ...new Set(upcoming.map(placeOf).filter((p): p is string => p !== null)),
    ];
    return [
      {
        id: c.communityId,
        slug: c.slug,
        name: c.name,
        description: c.description,
        logoUrl: c.logoUrl,
        joinPolicy: facts.joinPolicy,
        createdAt: facts.createdAt,
        memberCount: c.memberCount,
        activeRecently: c.activeNow,
        newJoins: c.newJoins,
        score: livenessScore(c),
        isNew: isNewCommunity(facts.createdAt, opts.now),
        openRooms: opts.openRooms?.get(c.communityId) ?? 0,
        nextEvent: first
          ? {
              slug: first.slug,
              title: first.title,
              date: first.date,
              startTime: first.startTime,
              timezone: first.timezone,
              city: first.city,
              online: first.online,
            }
          : null,
        places,
      },
    ];
  });
}

/** Search matches the name or the description, ignoring case and accents. */
export function matchesQuery(c: DirectoryCommunity, q: string): boolean {
  const needle = foldText(q);
  if (!needle) return true;
  return (
    foldText(c.name).includes(needle) ||
    foldText(c.description ?? "").includes(needle)
  );
}

/** The place filter matches any upcoming event's place. */
export function matchesPlace(c: DirectoryCommunity, place: string): boolean {
  const key = foldText(place);
  return c.places.some((p) => foldText(p) === key);
}

function byId(a: DirectoryCommunity, b: DirectoryCommunity) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const COMPARE: Record<
  DirectorySort,
  (a: DirectoryCommunity, b: DirectoryCommunity) => number
> = {
  active: (a, b) =>
    b.score - a.score ||
    b.activeRecently - a.activeRecently ||
    b.memberCount - a.memberCount ||
    byId(a, b),
  newest: (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || byId(a, b),
  largest: (a, b) =>
    b.memberCount - a.memberCount || b.score - a.score || byId(a, b),
};

export function sortDirectory(
  items: readonly DirectoryCommunity[],
  sort: DirectorySort,
): DirectoryCommunity[] {
  return [...items].sort(COMPARE[sort]);
}

/**
 * Places the filter offers: most communities first, then by name. The
 * same place spelled differently counts once, under one stable spelling
 * (the first in code-point order), so the chip label never flips between
 * requests.
 */
export function directoryPlaces(
  items: readonly DirectoryCommunity[],
): DirectoryPlace[] {
  const counts = new Map<string, { key: string; ids: Set<string> }>();
  for (const c of items) {
    for (const p of c.places) {
      const folded = foldText(p);
      const hit = counts.get(folded);
      if (!hit) counts.set(folded, { key: p, ids: new Set([c.id]) });
      else {
        hit.ids.add(c.id);
        if (p < hit.key) hit.key = p;
      }
    }
  }
  return [...counts.values()]
    .map(({ key, ids }) => ({ key, communities: ids.size }))
    .sort(
      (a, b) =>
        b.communities - a.communities ||
        (a.key === ONLINE_PLACE ? 1 : b.key === ONLINE_PLACE ? -1 : 0) ||
        a.key.localeCompare(b.key),
    );
}

/**
 * One page of the directory. Places are counted over every listed
 * community (so the filter never offers a dead end), results over the
 * search + place match. `cursor` is the offset of the page.
 */
export function queryDirectory(
  all: readonly DirectoryCommunity[],
  input: {
    q?: string;
    place?: string;
    sort: DirectorySort;
    limit: number;
    cursor?: number | null;
  },
): {
  items: DirectoryCommunity[];
  total: number;
  nextCursor: number | null;
  places: DirectoryPlace[];
} {
  const matched = all.filter(
    (c) =>
      (!input.q || matchesQuery(c, input.q)) &&
      (!input.place || matchesPlace(c, input.place)),
  );
  const sorted = sortDirectory(matched, input.sort);
  const start = Math.max(0, input.cursor ?? 0);
  const end = start + input.limit;
  return {
    items: sorted.slice(start, end),
    total: sorted.length,
    nextCursor: end < sorted.length ? end : null,
    places: directoryPlaces(all),
  };
}

/** What an anonymous visitor may see of a community in the directory. */
export type PublicDirectoryCommunity = {
  id: string;
  slug: string;
  name: string;
  /** Null when empty or only repeating the name. */
  description: string | null;
  logoUrl: string | null;
  joinPolicy: JoinPolicy;
  memberCount: number;
  activeRecently: number;
  isNew: boolean;
  openRooms: number;
  nextEvent: Pick<DirectoryNextEvent, "date" | "city" | "online"> | null;
};

/**
 * The public shape: only the facts the page shows. Ranking internals
 * (score, new joins) and the event's internal fields stay on the server.
 */
export function toPublicDirectoryCommunity(
  c: DirectoryCommunity,
): PublicDirectoryCommunity {
  const description = c.description?.trim() ?? "";
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description:
      description && foldText(description) !== foldText(c.name)
        ? description
        : null,
    logoUrl: c.logoUrl,
    joinPolicy: c.joinPolicy,
    memberCount: c.memberCount,
    activeRecently: c.activeRecently,
    isNew: c.isNew,
    openRooms: c.openRooms,
    nextEvent: c.nextEvent
      ? {
          date: c.nextEvent.date,
          city: c.nextEvent.city,
          online: c.nextEvent.online,
        }
      : null,
  };
}
