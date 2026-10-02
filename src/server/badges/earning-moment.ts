/**
 * The earning moment (ADR-0039, slice 5): what the celebration dialog
 * shows a member, and the write that makes it fire once.
 *
 * A row is celebrated only when both hold:
 * - its `seen_at` is null, and
 * - the live path that celebrated it left its marker: a `badge_earned`
 *   notification for that member and badge slug, or an `award_won`
 *   notification for that award row.
 *
 * The engine stores silent tiers and backfill writes as seen and writes
 * the notification only for a celebrated tier; awards are notified only by
 * `grantChallengeAward`, never by the backfill. Requiring the marker too
 * keeps a null `seen_at` written by anything else (an older deployment
 * during a build, a preview or a local run sharing the database, an older
 * backfill) from ever being celebrated. Migration 20261002c marked every
 * row from before this slice seen.
 */
import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

import { isBadgeSlug, type BadgeSlug } from "@/lib/badges/catalog";
import { effectivePins } from "@/lib/badges/showcase";
import {
  memberAwards,
  memberBadges,
  memberProfiles,
  notifications,
} from "@/server/db/schema";
import { displayableBadgeRows } from "@/server/members/displayable-badges";
import {
  profileReach,
  profileReachColumns,
  type ProfileReach,
} from "@/server/members/profile-access";

import type { BadgeDb } from "./metrics";
import type { BadgeRarity, BadgeRarityReport } from "./rarity";
import { AWARD_WON_NOTIFICATION, BADGE_EARNED_NOTIFICATION } from "./notify";
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
   * The member's profile, or null when they have none yet (no showcase to
   * pin to, no badge page to share).
   */
  profile: {
    /**
     * The showcase as it stands (effective pins), so the dialog knows
     * whether "Show on my profile" can pin.
     */
    pins: BadgeSlug[];
    /** Whether visitors can see it: a badge page exists only when public. */
    reach: ProfileReach;
  } | null;
}

/** Nothing to celebrate. */
export const NO_UNSEEN_EARNINGS: UnseenEarnings = {
  items: [],
  moreIds: [],
  profile: null,
};

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
  profile: UnseenEarnings["profile"],
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
    profile,
  };
}

/** The member's effective showcase pins and reach, or null without a profile. */
async function loadProfile(
  db: BadgeDb,
  userId: string,
): Promise<UnseenEarnings["profile"]> {
  const [profile] = await db
    .select({ pins: memberProfiles.showcaseBadges, ...profileReachColumns() })
    .from(memberProfiles)
    .where(eq(memberProfiles.userId, userId))
    .limit(1);
  if (!profile) return null;
  return {
    pins: effectivePins(profile.pins, await loadHeldBadgeSlugs(db, userId)),
    reach: profileReach(profile),
  };
}

/** A `badge_earned` notification exists for this badge row. */
function celebratedBadge(): SQL {
  return sql`exists (
    select 1 from ${notifications}
    where ${notifications.userId} = ${memberBadges.userId}
      and ${notifications.type} = ${BADGE_EARNED_NOTIFICATION}
      and ${notifications.metadata}->>'badgeSlug' = ${memberBadges.badgeSlug}
  )`;
}

/** An `award_won` notification exists for this award row. */
function celebratedAward(): SQL {
  return sql`exists (
    select 1 from ${notifications}
    where ${notifications.userId} = ${memberAwards.userId}
      and ${notifications.type} = ${AWARD_WON_NOTIFICATION}
      and ${notifications.metadata}->>'awardId' = ${memberAwards.id}
  )`;
}

/**
 * The member's unseen badges and awards. Rarity is supplementary and only
 * loaded when there is something to celebrate: `loadRarity` resolves to
 * null when it could not be loaded.
 */
export async function loadUnseenEarnings(
  db: BadgeDb,
  userId: string,
  loadRarity: () => Promise<BadgeRarityReport | null>,
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
          celebratedBadge(),
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
      .where(
        and(
          eq(memberAwards.userId, userId),
          isNull(memberAwards.seenAt),
          celebratedAward(),
        ),
      )
      .orderBy(asc(memberAwards.earnedAt), asc(memberAwards.id))
      .limit(UNSEEN_READ_CAP),
  ]);
  if (badges.length === 0 && awards.length === 0) return NO_UNSEEN_EARNINGS;
  const [rarity, profile] = await Promise.all([
    badges.length > 0 ? loadRarity() : Promise.resolve(null),
    loadProfile(db, userId),
  ]);
  return toUnseenEarnings(badges, awards, rarity, profile);
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
