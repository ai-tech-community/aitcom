/**
 * The public community directory (Explore page). Pure rules — no DB: what a
 * listed community shows, how search, the place and "what do you want"
 * filters match, how the sorts order (including by distance), and which
 * places and wants the filters offer. Loading lives in
 * `directory-queries.ts`.
 */

import type { CommunityCandidate } from "@/server/communities/discovery";
import { livenessScore } from "@/server/communities/discovery";
import type { JoinPolicy } from "@/server/communities/invite-policy";
import { haversineDistanceKm } from "@/lib/geo";

export const DIRECTORY_SORTS = ["active", "newest", "largest", "near"] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

/**
 * What a visitor can come for, each read from what a community really
 * offers right now:
 * - meet: an upcoming in-person or hybrid event;
 * - learn: a published course open to visitors;
 * - build: an active challenge or an upcoming hackathon;
 * - work: an open job.
 */
export const DIRECTORY_WANTS = ["meet", "learn", "build", "work"] as const;
export type DirectoryWant = (typeof DIRECTORY_WANTS)[number];

export type GeoPoint = { lat: number; lng: number };

export type { JoinPolicy };

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
export type DirectoryEventRow = DirectoryNextEvent & {
  communityId: string;
  /** Where it takes place, when geocoded and not online. */
  point: GeoPoint | null;
  hackathon: boolean;
};

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
  /** What a visitor can come for (see `DIRECTORY_WANTS`). */
  wants: DirectoryWant[];
  /** Where its upcoming in-person events are (for "near you"). */
  points: GeoPoint[];
};

export type DirectoryPlace = { key: string; communities: number };
export type DirectoryWantCount = { key: DirectoryWant; communities: number };

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
  /** Community ids with a public course / active challenge / open job. */
  offerings?: {
    learn?: ReadonlySet<string>;
    build?: ReadonlySet<string>;
    work?: ReadonlySet<string>;
  };
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
    const has = {
      meet: upcoming.some((e) => !e.online),
      learn: opts.offerings?.learn?.has(c.communityId) ?? false,
      build:
        (opts.offerings?.build?.has(c.communityId) ?? false) ||
        upcoming.some((e) => e.hackathon),
      work: opts.offerings?.work?.has(c.communityId) ?? false,
    };
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
        wants: DIRECTORY_WANTS.filter((w) => has[w]),
        points: upcoming
          .map((e) => e.point)
          .filter((p): p is GeoPoint => p !== null),
      },
    ];
  });
}

/**
 * How far a community is from `origin`: the distance to its nearest
 * upcoming in-person event, or null when it has none with a location.
 */
export function distanceFrom(
  c: Pick<DirectoryCommunity, "points">,
  origin: GeoPoint,
): number | null {
  if (c.points.length === 0) return null;
  return Math.min(...c.points.map((p) => haversineDistanceKm(origin, p)));
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

/** A community as sorted: with its distance when the visitor asked "near". */
type Ranked = DirectoryCommunity & { distanceKm?: number | null };

const byActivity = (a: DirectoryCommunity, b: DirectoryCommunity) =>
  b.score - a.score ||
  b.activeRecently - a.activeRecently ||
  b.memberCount - a.memberCount ||
  byId(a, b);

const COMPARE: Record<DirectorySort, (a: Ranked, b: Ranked) => number> = {
  active: byActivity,
  newest: (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || byId(a, b),
  largest: (a, b) =>
    b.memberCount - a.memberCount || b.score - a.score || byId(a, b),
  // Nearest first; communities with no located event after, by activity.
  near: (a, b) => {
    const da = a.distanceKm ?? null;
    const db = b.distanceKm ?? null;
    if (da === null || db === null) {
      if (da !== db) return da === null ? 1 : -1;
      return byActivity(a, b);
    }
    return da - db || byActivity(a, b);
  },
};

export function sortDirectory<T extends Ranked>(
  items: readonly T[],
  sort: DirectorySort,
): T[] {
  return [...items].sort(COMPARE[sort]);
}

/** Wants the filter offers: those at least one listed community has. */
export function directoryWants(
  items: readonly DirectoryCommunity[],
): DirectoryWantCount[] {
  return DIRECTORY_WANTS.map((key) => ({
    key,
    communities: items.filter((c) => c.wants.includes(key)).length,
  })).filter((w) => w.communities > 0);
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
 * One page of the directory. Places and wants are counted over every
 * listed community (so the filters never offer a dead end), results over
 * the search + place + want match. "near" needs an `origin`; without one
 * it orders by activity. `cursor` is the offset of the page.
 */
export function queryDirectory(
  all: readonly DirectoryCommunity[],
  input: {
    q?: string;
    place?: string;
    want?: DirectoryWant;
    sort: DirectorySort;
    origin?: GeoPoint | null;
    limit: number;
    cursor?: number | null;
  },
): {
  items: (DirectoryCommunity & { distanceKm: number | null })[];
  total: number;
  nextCursor: number | null;
  places: DirectoryPlace[];
  wants: DirectoryWantCount[];
} {
  const origin = input.origin ?? null;
  const matched: (DirectoryCommunity & { distanceKm: number | null })[] = all
    .filter(
      (c) =>
        (!input.q || matchesQuery(c, input.q)) &&
        (!input.place || matchesPlace(c, input.place)) &&
        (!input.want || c.wants.includes(input.want)),
    )
    .map((c) => ({
      ...c,
      distanceKm: origin ? distanceFrom(c, origin) : null,
    }));
  const sort = input.sort === "near" && !origin ? "active" : input.sort;
  const sorted = sortDirectory(matched, sort);
  const start = Math.max(0, input.cursor ?? 0);
  const end = start + input.limit;
  return {
    items: sorted.slice(start, end),
    total: sorted.length,
    nextCursor: end < sorted.length ? end : null,
    places: directoryPlaces(all),
    wants: directoryWants(all),
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
  wants: DirectoryWant[];
  /** Km to its nearest upcoming in-person event, when asked "near". */
  distanceKm: number | null;
};

/**
 * The public shape: only the facts the page shows. Ranking internals
 * (score, new joins) and the event's internal fields stay on the server.
 */
export function toPublicDirectoryCommunity(
  c: DirectoryCommunity & { distanceKm?: number | null },
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
    wants: c.wants,
    // Coarse on purpose: enough to choose, not to locate anyone.
    distanceKm:
      c.distanceKm === undefined || c.distanceKm === null
        ? null
        : Math.round(c.distanceKm),
  };
}
