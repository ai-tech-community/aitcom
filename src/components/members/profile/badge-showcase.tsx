import { useTranslations } from "next-intl";

import type { BadgeSlug } from "@/lib/badges/catalog";
import { catalogBadge } from "@/lib/badges/catalog";
import type { BadgeRarityReport } from "@/server/badges/rarity";
import { BadgeEmblem } from "@/components/badges/badge-emblem";
import { useRarityLabel } from "@/components/badges/use-rarity-label";

/**
 * The Overview showcase: up to three badges, large, each with its name
 * and rarity. Which ones (pinned or rarest) is decided on the server.
 */
export function BadgeShowcase({
  slugs,
  earnedAt,
  rarity,
}: {
  slugs: readonly BadgeSlug[];
  /** When each shown badge was earned. */
  earnedAt: ReadonlyMap<string, Date | string>;
  rarity: BadgeRarityReport | null;
}) {
  const tBadges = useTranslations("badges");
  const rarityOf = useRarityLabel(rarity);
  return (
    <ul className="flex flex-wrap gap-x-8 gap-y-6">
      {slugs.flatMap((slug) => {
        const badge = catalogBadge(slug);
        const at = earnedAt.get(slug);
        if (!badge || at === undefined) return [];
        const rare = rarityOf(slug);
        return [
          <li
            key={slug}
            data-badge={slug}
            className="flex w-32 flex-col items-center gap-2 text-center"
          >
            <BadgeEmblem
              subject={{ kind: "badge", slug }}
              state={{ earned: true, earnedAt: at }}
              size="lg"
            />
            <span className="text-sm leading-tight font-medium">
              {tBadges(badge.nameKey)}
            </span>
            {rare && (
              <span className="text-muted-foreground font-mono text-xs leading-snug">
                {rare}
              </span>
            )}
          </li>,
        ];
      })}
    </ul>
  );
}
