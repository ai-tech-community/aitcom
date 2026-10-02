import { sql } from "drizzle-orm";

import {
  BADGE_CATALOG,
  BADGE_SLUGS,
  type BadgeSlug,
} from "@/lib/badges/catalog";
import type { db as appDb } from "@/server/db";
import { createTtlMemo } from "@/server/ttl-memo";

/** How rare a badge is, as shown on the badge detail and the Badges tab. */
export type BadgeRarity =
  | {
      slug: BadgeSlug;
      /** Holders as a share of members with a profile (0–1). */
      measure: "share";
      holders: number;
      share: number;
    }
  | {
      slug: BadgeSlug;
      /** Limited editions show the absolute number ("1 of 100"). */
      measure: "count";
      holders: number;
      editionSize: number;
    };

/** The public rarity DTO: every catalog badge, in catalog order. */
export interface BadgeRarityReport {
  members: number;
  badges: BadgeRarity[];
}

const RARITY_TTL_MS = 60 * 60 * 1000;
const memo = createTtlMemo<"all", BadgeRarityReport>(RARITY_TTL_MS);

/** Builds the report from holder counts; pure, so it is unit-testable. */
export function toBadgeRarityReport(
  members: number,
  holdersBySlug: ReadonlyMap<string, number>,
): BadgeRarityReport {
  return {
    members,
    badges: BADGE_CATALOG.map((badge): BadgeRarity => {
      const holders = holdersBySlug.get(badge.slug) ?? 0;
      return badge.kind === "limitedEdition"
        ? {
            slug: badge.slug,
            measure: "count",
            holders,
            editionSize: badge.editionSize,
          }
        : {
            slug: badge.slug,
            measure: "share",
            holders,
            share: members > 0 ? holders / members : 0,
          };
    }),
  };
}

/**
 * Holders of each catalog badge among members with a profile, and the
 * number of such members, in one grouped query.
 */
export async function loadBadgeRarity(
  db: typeof appDb,
): Promise<BadgeRarityReport> {
  const slugs = sql.join(
    BADGE_SLUGS.map((slug) => sql`${slug}`),
    sql`, `,
  );
  const res = await db.execute<{
    members: number;
    slug: string | null;
    holders: number | null;
  }>(sql`
    WITH members AS (
      SELECT count(*)::int AS members FROM "app"."member_profile"
    ),
    holders AS (
      SELECT b.badge_slug AS slug, count(*)::int AS holders
      FROM "app"."member_badge" b
      JOIN "app"."member_profile" p ON p.user_id = b.user_id
      WHERE b.badge_slug IN (${slugs})
      GROUP BY b.badge_slug
    )
    SELECT m.members, h.slug, h.holders
    FROM members m
    LEFT JOIN holders h ON true
  `);
  const members = Number(res.rows[0]?.members ?? 0);
  const holdersBySlug = new Map(
    res.rows.flatMap((row) =>
      row.slug ? [[row.slug, Number(row.holders ?? 0)] as const] : [],
    ),
  );
  return toBadgeRarityReport(members, holdersBySlug);
}

/** Badge rarity, cached for an hour per server instance. */
export function getBadgeRarity(db: typeof appDb): Promise<BadgeRarityReport> {
  return memo.get("all", () => loadBadgeRarity(db));
}

/** Test seam: drop the cached report. */
export function clearBadgeRarityCache(): void {
  memo.clear();
}
