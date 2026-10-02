/**
 * The earning moment (ADR-0039, slice 5): what the celebration dialog
 * shows a member, and the write that makes it fire once.
 *
 * A badge or award row is unseen while its `seen_at` is null. The engine
 * leaves it null only for a tier the triggering action reached (and a live
 * challenge award); silent tiers and backfill writes are stored as seen,
 * and migration 20261002c marked every row from before this slice seen.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { isBadgeSlug, type BadgeSlug } from "@/lib/badges/catalog";
import { effectivePins } from "@/lib/badges/showcase";
import { memberAwards, memberBadges, memberProfiles } from "@/server/db/schema";
import { displayableBadgeRows } from "@/server/members/displayable-badges";

import type { BadgeDb } from "./metrics";
import type { BadgeRarity, BadgeRarityReport } from "./rarity";
import { loadHeldBadgeSlugs } from "./showcase";

/** Earnings the dialog walks through, one at a time, oldest first. */
export const CELEBRATION_LIMIT = 3;

/**
 * Most unseen rows read at once. The ones past `CELEBRATION_LIMIT` are
 * summed up as "+N more" and marked seen with the rest; anything beyond
 * this cap shows on a later page load.
 */
export const UNSEEN_READ_CAP = 100;

/** One unseen earning, as the celebration dialog receives it. */
export type UnseenEarning =
  | {
      kind: "badge";
      /** The `member_badge` row id, for `markSeen`. */
      id: string;
      slug: BadgeSlug;
      earnedAt: string;
      /** Null when rarity could not be loaded. */
      rarity: BadgeRarity | null;
    }
  | {
      kind: "award";
      /** The `member_award` row id, for `markSeen`. */
      id: string;
      label: string;
      earnedAt: string;
    };

/** The caller's unseen earnings: an explicit DTO, only their own rows. */
export interface UnseenEarnings {
  /** Up to `CELEBRATION_LIMIT`, oldest first. */
  items: UnseenEarning[];
  /**
   * Ids of the other unseen rows read, marked seen together with the
   * shown ones; the dialog says "+N more" for them.
   */
  moreIds: string[];
  /**
   * The member's showcase as it stands (effective pins), so the dialog
   * knows whether "Show on my profile" can pin. Null when the member has
   * no profile yet, so there is no showcase to pin to.
   */
  pins: BadgeSlug[] | null;
}

interface UnseenRow {
  id: string;
  earnedAt: Date;
  badgeSlug?: string;
  label?: string;
}

/**
 * Builds the DTO from unseen rows of both kinds; pure, so the ordering and
 * the cap are unit-testable.
 */
export function toUnseenEarnings(
  badges: readonly { id: string; badgeSlug: string; earnedAt: Date }[],
  awards: readonly { id: string; label: string; earnedAt: Date }[],
  rarity: BadgeRarityReport | null,
  pins: BadgeSlug[] | null,
): UnseenEarnings {
  const raritiesBySlug = new Map(
    (rarity?.badges ?? []).map((entry) => [entry.slug, entry]),
  );
  const rows: UnseenRow[] = [
    ...badges.filter((row) => isBadgeSlug(row.badgeSlug)),
    ...awards,
  ]
    .sort(
      (a, b) =>
        a.earnedAt.getTime() - b.earnedAt.getTime() || a.id.localeCompare(b.id),
    )
    .slice(0, UNSEEN_READ_CAP);

  const items = rows.slice(0, CELEBRATION_LIMIT).map(
    (row): UnseenEarning =>
      row.badgeSlug !== undefined
        ? {
            kind: "badge",
            id: row.id,
            slug: row.badgeSlug as BadgeSlug,
            earnedAt: row.earnedAt.toISOString(),
            rarity: raritiesBySlug.get(row.badgeSlug as BadgeSlug) ?? null,
          }
        : {
            kind: "award",
            id: row.id,
            label: row.label ?? "",
            earnedAt: row.earnedAt.toISOString(),
          },
  );
  return {
    items,
    moreIds: rows.slice(CELEBRATION_LIMIT).map((row) => row.id),
    pins,
  };
}

/** The member's effective showcase pins, or null without a profile. */
async function loadPins(
  db: BadgeDb,
  userId: string,
): Promise<BadgeSlug[] | null> {
  const [profile] = await db
    .select({ pins: memberProfiles.showcaseBadges })
    .from(memberProfiles)
    .where(eq(memberProfiles.userId, userId))
    .limit(1);
  if (!profile) return null;
  return effectivePins(profile.pins, await loadHeldBadgeSlugs(db, userId));
}

/**
 * The member's unseen badges and awards. `rarity` is supplementary: pass
 * null when it could not be loaded.
 */
export async function loadUnseenEarnings(
  db: BadgeDb,
  userId: string,
  rarity: BadgeRarityReport | null,
): Promise<UnseenEarnings> {
  const [badges, awards] = await Promise.all([
    db
      .select({
        id: memberBadges.id,
        badgeSlug: memberBadges.badgeSlug,
        earnedAt: memberBadges.earnedAt,
      })
      .from(memberBadges)
      .where(
        and(
          eq(memberBadges.userId, userId),
          isNull(memberBadges.seenAt),
          displayableBadgeRows(),
        ),
      )
      .orderBy(asc(memberBadges.earnedAt), asc(memberBadges.id))
      .limit(UNSEEN_READ_CAP),
    db
      .select({
        id: memberAwards.id,
        label: memberAwards.label,
        earnedAt: memberAwards.earnedAt,
      })
      .from(memberAwards)
      .where(and(eq(memberAwards.userId, userId), isNull(memberAwards.seenAt)))
      .orderBy(asc(memberAwards.earnedAt), asc(memberAwards.id))
      .limit(UNSEEN_READ_CAP),
  ]);
  if (badges.length === 0 && awards.length === 0) {
    return { items: [], moreIds: [], pins: null };
  }
  return toUnseenEarnings(badges, awards, rarity, await loadPins(db, userId));
}

/**
 * Marks the given badge and award rows seen, only where they belong to the
 * member and are still unseen; other ids are ignored. Returns how many rows
 * changed.
 */
export async function markEarningsSeen(
  db: BadgeDb,
  userId: string,
  ids: readonly string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const unique = [...new Set(ids)];
  const [badges, awards] = await Promise.all([
    db
      .update(memberBadges)
      .set({ seenAt: sql`now()` })
      .where(
        and(
          eq(memberBadges.userId, userId),
          inArray(memberBadges.id, unique),
          isNull(memberBadges.seenAt),
        ),
      )
      .returning({ id: memberBadges.id }),
    db
      .update(memberAwards)
      .set({ seenAt: sql`now()` })
      .where(
        and(
          eq(memberAwards.userId, userId),
          inArray(memberAwards.id, unique),
          isNull(memberAwards.seenAt),
        ),
      )
      .returning({ id: memberAwards.id }),
  ]);
  return badges.length + awards.length;
}
