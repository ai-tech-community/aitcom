/**
 * The profile showcase (ADR-0039): up to three badges on a member's
 * Overview. The member pins them from the Badges tab; with nothing pinned
 * the showcase shows their three rarest badges.
 *
 * Pinning a track badge pins the track: the showcase always shows the
 * highest tier of it the member holds, so earning Writer III does not
 * leave Writer II on display.
 *
 * Pure rules, shared by the pin procedures, the profile DTO and the UI.
 */
import {
  catalogBadge,
  isBadgeSlug,
  type BadgeSlug,
  type CatalogBadge,
} from "./catalog";

/** Most badges a member can pin; also a CHECK on `showcase_badges`. */
export const SHOWCASE_LIMIT = 3;

/** Holders of a badge among members; fewer is rarer. */
export type HoldersOf = (slug: BadgeSlug) => number;

/** Tie-break among equally rare badges: the one that took more to earn. */
function prestige(badge: CatalogBadge): number {
  if (badge.kind === "limitedEdition") return 4;
  if (badge.kind === "track") return badge.tier;
  return 0;
}

/** Same track (any tier), or the same slug for a badge without tiers. */
export function sameBadgeLine(a: BadgeSlug, b: BadgeSlug): boolean {
  if (a === b) return true;
  const x = catalogBadge(a);
  const y = catalogBadge(b);
  return x?.kind === "track" && y?.kind === "track" && x.track === y.track;
}

/** The held badges with each track reduced to its highest tier. */
export function highestTiers(held: readonly BadgeSlug[]): BadgeSlug[] {
  const best = new Map<string, CatalogBadge>();
  for (const slug of held) {
    const badge = catalogBadge(slug);
    if (!badge) continue;
    const line = badge.kind === "track" ? `track:${badge.track}` : badge.slug;
    const current = best.get(line);
    if (!current || prestige(badge) > prestige(current)) best.set(line, badge);
  }
  return [...best.values()].map((badge) => badge.slug);
}

/** Badges rarest first: fewest holders, then the harder one to earn. */
export function rarestFirst(
  slugs: readonly BadgeSlug[],
  holders: HoldersOf,
): BadgeSlug[] {
  return slugs
    .map((slug, index) => ({ slug, index, badge: catalogBadge(slug) }))
    .filter((entry) => entry.badge !== null)
    .sort(
      (a, b) =>
        holders(a.slug) - holders(b.slug) ||
        prestige(b.badge!) - prestige(a.badge!) ||
        a.index - b.index,
    )
    .map((entry) => entry.slug);
}

/** The `count` rarest badges a member holds, one per track. */
export function rarestBadges(
  held: readonly BadgeSlug[],
  holders: HoldersOf,
  count = SHOWCASE_LIMIT,
): BadgeSlug[] {
  return rarestFirst(highestTiers(held), holders).slice(0, count);
}

/**
 * The badges a compact view shows when the member chose none: the rarest,
 * or — when rarity could not be loaded — the most recent. `held` must be
 * newest first for that fallback.
 */
export function featuredBadges(
  held: readonly BadgeSlug[],
  holders: HoldersOf | null,
  count = SHOWCASE_LIMIT,
): BadgeSlug[] {
  return holders
    ? rarestBadges(held, holders, count)
    : highestTiers(held).slice(0, count);
}

/**
 * The stored pins that still apply, in pin order: slugs the member holds,
 * each track badge raised to the highest tier held, one per track.
 */
export function effectivePins(
  pinned: readonly string[],
  held: readonly BadgeSlug[],
): BadgeSlug[] {
  const top = highestTiers(held);
  const result: BadgeSlug[] = [];
  for (const slug of pinned) {
    if (!isBadgeSlug(slug) || !held.includes(slug)) continue;
    const shown = top.find((t) => sameBadgeLine(t, slug)) ?? slug;
    if (!result.includes(shown)) result.push(shown);
  }
  return result.slice(0, SHOWCASE_LIMIT);
}

export interface Showcase {
  slugs: BadgeSlug[];
  /**
   * Whether the member chose these, or they are the rarest held (the most
   * recent when rarity is unavailable).
   */
  source: "pinned" | "rarest" | "recent";
}

/**
 * What the Overview showcase shows. `held` is newest first; `holders` is
 * null when rarity could not be loaded.
 */
export function resolveShowcase(
  pinned: readonly string[],
  held: readonly BadgeSlug[],
  holders: HoldersOf | null,
): Showcase {
  const pins = effectivePins(pinned, held);
  if (pins.length > 0) return { slugs: pins, source: "pinned" };
  return {
    slugs: featuredBadges(held, holders),
    source: holders ? "rarest" : "recent",
  };
}

export type PinOutcome =
  | { ok: true; next: BadgeSlug[] }
  | { ok: false; reason: "not_held" | "full" };

/**
 * The stored pins after pinning `slug`. Stale pins (no longer held, or no
 * longer in the catalog) are dropped first; pinning another tier of an
 * already pinned track replaces that pin in place.
 *
 * With nothing pinned yet, the profile shows `fallback` (its rarest
 * badges), so the first pin keeps that showcase and puts the new badge
 * first, dropping the last fallback badge if needed, instead of shrinking
 * the showcase to one badge.
 */
export function planPin(
  stored: readonly string[],
  slug: string,
  held: readonly BadgeSlug[],
  fallback: readonly BadgeSlug[] = [],
): PinOutcome {
  if (!isBadgeSlug(slug) || !held.includes(slug)) {
    return { ok: false, reason: "not_held" };
  }
  const current = stored.filter(
    (s): s is BadgeSlug => isBadgeSlug(s) && held.includes(s),
  );
  if (current.length === 0) {
    const kept = fallback.filter(
      (s) => held.includes(s) && !sameBadgeLine(s, slug),
    );
    return { ok: true, next: [slug, ...kept].slice(0, SHOWCASE_LIMIT) };
  }
  const sameLine = current.findIndex((s) => sameBadgeLine(s, slug));
  if (sameLine >= 0) {
    const next = [...current];
    next[sameLine] = slug;
    return { ok: true, next };
  }
  if (current.length >= SHOWCASE_LIMIT) return { ok: false, reason: "full" };
  return { ok: true, next: [...current, slug] };
}

/** The stored pins after unpinning `slug` (and any tier of its track). */
export function planUnpin(stored: readonly string[], slug: string): string[] {
  return stored.filter(
    (s) =>
      s !== slug &&
      !(isBadgeSlug(s) && isBadgeSlug(slug) && sameBadgeLine(s, slug)),
  );
}

/**
 * Whether a just-earned badge can go on the showcase: already shown (its
 * line is pinned, so the showcase raises it to this tier), open, or full.
 * `pins` are the effective pins.
 */
export type ShowcasePinState = "pinned" | "open" | "full";

export function showcasePinState(
  pins: readonly BadgeSlug[],
  slug: BadgeSlug,
): ShowcasePinState {
  if (pins.some((pin) => sameBadgeLine(pin, slug))) return "pinned";
  return pins.length >= SHOWCASE_LIMIT ? "full" : "open";
}
