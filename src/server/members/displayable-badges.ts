import { inArray } from "drizzle-orm";

import { DISPLAYABLE_BADGE_SLUGS, displayableBadge } from "@/lib/gamification";
import { memberBadges } from "@/server/db/schema";

/**
 * The `member_badge` rows that are shown and counted: those whose slug is in
 * the badge catalog. Every badge list and badge count uses this, so a count
 * always equals what the profile shows.
 */
export function displayableBadgeRows() {
  return inArray(memberBadges.badgeSlug, [...DISPLAYABLE_BADGE_SLUGS]);
}

/** Catalog entries for stored badge rows, skipping slugs not in the catalog. */
export function toDisplayableBadges(
  rows: readonly { badgeSlug: string; earnedAt: Date }[],
) {
  return rows.flatMap((row) => {
    const badge = displayableBadge(row.badgeSlug);
    return badge ? [{ ...badge, earnedAt: row.earnedAt }] : [];
  });
}
