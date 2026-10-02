import { useFormatter, useTranslations } from "next-intl";

import { catalogBadge } from "@/lib/badges/catalog";

import type { EmblemState, EmblemSubject } from "./badge-emblem";

const TIER_NUMERALS = { 1: "I", 2: "II", 3: "III" } as const;

/**
 * The accessible name of a badge emblem, in the viewer's language:
 * "Writer, tier II, earned March 3, 2026", "Writer, tier III, locked, 3 of
 * 15", "Writer, tier I, being added". A hook that works in server and
 * client components alike, so `BadgeEmblem` itself stays free of
 * translation hooks and renders on the server.
 */
export function useEmblemLabel(): (
  subject: EmblemSubject,
  state: EmblemState,
) => string {
  const t = useTranslations("badgeEmblem");
  const tBadges = useTranslations("badges");
  const format = useFormatter();

  return (subject, state) => {
    const badge = subject.kind === "badge" ? catalogBadge(subject.slug) : null;
    const name =
      subject.kind === "award"
        ? t("award", { label: subject.label })
        : badge?.kind === "track"
          ? t("tier", {
              track: tBadges(`tracks.${badge.track}`),
              tier: TIER_NUMERALS[badge.tier],
            })
          : badge?.kind === "limitedEdition"
            ? t("limited", { name: tBadges(badge.nameKey) })
            : badge
              ? tBadges(badge.nameKey)
              : "";
    if (state.earned) {
      return state.earnedAt === null
        ? name
        : t("earned", {
            name,
            date: format.dateTime(new Date(state.earnedAt), {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
          });
    }
    if (!state.progress) return t("locked", { name });
    // Never "12 of 1": a met threshold is a tier the engine is adding.
    if (state.progress.current >= state.progress.threshold) {
      return t("beingAdded", { name });
    }
    return t("lockedProgress", {
      name,
      current: Math.max(0, state.progress.current),
      threshold: state.progress.threshold,
    });
  };
}
