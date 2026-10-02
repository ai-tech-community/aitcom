import { inArray } from "drizzle-orm";

import { BADGE_SLUGS, isBadgeSlug, type BadgeSlug } from "@/lib/badges/catalog";
import { memberBadges } from "@/server/db/schema";

/**
 * The `member_badge` rows that are shown and counted: those whose slug is in
 * the badge catalog. Every badge list and badge count uses this, so a count
 * always equals what the profile shows. A stored row whose slug is not in
 * the catalog stays in the database but is neither shown nor counted.
 */
export function displayableBadgeRows() {
  return inArray(memberBadges.badgeSlug, [...BADGE_SLUGS]);
}

/** An earned catalog badge as the profile and dashboard receive it. */
export interface DisplayableBadge {
  slug: BadgeSlug;
  earnedAt: Date;
}

/** Stored badge rows as their DTO, skipping slugs not in the catalog. */
export function toDisplayableBadges(
  rows: readonly { badgeSlug: string; earnedAt: Date }[],
): DisplayableBadge[] {
  return rows.flatMap((row) =>
    isBadgeSlug(row.badgeSlug)
      ? [{ slug: row.badgeSlug, earnedAt: row.earnedAt }]
      : [],
  );
}
