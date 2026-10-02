import { useTranslations } from "next-intl";

import type { CatalogBadge } from "@/lib/badges/catalog";

const TIER_NUMERALS = { 1: "I", 2: "II", 3: "III" } as const;

/** What a badge is called and says, in the viewer's language. */
export interface BadgeText {
  /** "Writer III", "Profile complete". */
  name: string;
  /** "Writer · tier III", "Milestone", "Limited edition". */
  kind: string;
  /** "Published 15 approved articles". */
  description: string;
}

/**
 * The name, kind line and description of a catalog badge, for the
 * celebration dialog and the badge's share page. A hook that works in
 * server and client components alike.
 */
export function useBadgeText(): (badge: CatalogBadge) => BadgeText {
  const t = useTranslations("badgeMoment.kind");
  const tBadges = useTranslations("badges");
  return (badge) => ({
    name: tBadges(badge.nameKey),
    kind:
      badge.kind === "track"
        ? t("track", {
            track: tBadges(`tracks.${badge.track}`),
            tier: TIER_NUMERALS[badge.tier],
          })
        : badge.kind === "milestone"
          ? t("milestone")
          : t("limitedEdition"),
    description: tBadges(badge.descriptionKey, badge.descriptionValues),
  });
}
