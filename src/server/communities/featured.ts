import { isFeaturedStripCommunity } from "@/server/communities/content-visibility";
import { HUB_SLUG } from "@/server/communities/hub";

/**
 * Homepage featured set (Pulse). Explicit slugs — not trending — so the
 * unlisted Hub door (`ait`) can appear. Every other unlisted community is
 * dropped even when its slug is on this list.
 */
export const FEATURED_COMMUNITY_SLUGS = [
  "ait-community-netherlands",
  "xxx-ai",
  HUB_SLUG,
] as const;

/** Never put these on the homepage strip, even if they exist in the DB. */
export const NEVER_FEATURE_SLUGS = [
  "demo",
  "tester",
  "mlops-amsterdam",
] as const;

export type FeaturedCommunityCard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  memberCount: number;
  /**
   * Set when the card was loaded from the database. An unlisted community
   * is dropped, except the Hub.
   */
  isListedInDirectory?: boolean;
};

/** Postgres `count()` can arrive as a string; ICU plurals need a number. */
export function asMemberCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

/** Keep Pulse order; drop unknown / kill-list / missing / unlisted rows. */
export function pickFeaturedCommunities<
  T extends { slug: string; isListedInDirectory?: boolean },
>(rows: readonly T[]): T[] {
  const killed = new Set<string>(NEVER_FEATURE_SLUGS);
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return FEATURED_COMMUNITY_SLUGS.flatMap((slug) => {
    if (killed.has(slug)) return [];
    const row = bySlug.get(slug);
    if (!row) return [];
    if (
      typeof row.isListedInDirectory === "boolean" &&
      !isFeaturedStripCommunity({
        slug,
        isListedInDirectory: row.isListedInDirectory,
      })
    ) {
      return [];
    }
    return [row];
  });
}
