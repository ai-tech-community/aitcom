import { useFormatter, useTranslations } from "next-intl";

import type { BadgeSlug } from "@/lib/badges/catalog";
import type { BadgeRarity, BadgeRarityReport } from "@/server/badges/rarity";

/** Below this share a badge reads "Fewer than 1% of members". */
const RARE_SHARE = 0.01;

/**
 * How rare a badge is, in words: "Earned by 4% of members", "Fewer than
 * 1% of members", or for a limited edition "1 of 100 claimed". Null when
 * the report has no entry for the badge.
 */
export function useRarityLabel(
  report: BadgeRarityReport | null | undefined,
): (slug: BadgeSlug) => string | null {
  const t = useTranslations("badgeRarity");
  const format = useFormatter();
  const bySlug = new Map<string, BadgeRarity>(
    (report?.badges ?? []).map((rarity) => [rarity.slug, rarity]),
  );
  return (slug) => {
    const rarity = bySlug.get(slug);
    if (!rarity) return null;
    if (rarity.measure === "count") {
      return t("edition", {
        holders: rarity.holders,
        size: rarity.editionSize,
      });
    }
    if (rarity.share < RARE_SHARE) return t("fewerThanOnePercent");
    return t("share", {
      percent: format.number(rarity.share, {
        style: "percent",
        maximumFractionDigits: 0,
      }),
    });
  };
}
