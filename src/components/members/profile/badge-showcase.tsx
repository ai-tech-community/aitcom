import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { badgeShareHref } from "@/lib/member-profile-routes";
import { cn } from "@/lib/utils";
import type { BadgeSlug } from "@/lib/badges/catalog";
import { catalogBadge } from "@/lib/badges/catalog";
import type { BadgeRarityReport } from "@/server/badges/rarity";
import { BadgeEmblem } from "@/components/badges/badge-emblem";
import { useEmblemLabel } from "@/components/badges/use-emblem-label";
import { useRarityLabel } from "@/components/badges/use-rarity-label";

/**
 * The Overview showcase: up to three badges, large, each with its name
 * and rarity. Which ones (pinned or rarest) is decided on the server.
 */
export function BadgeShowcase({
  slugs,
  profileId,
  earnedAt,
  rarity,
}: {
  slugs: readonly BadgeSlug[];
  profileId?: string;
  /** When each shown badge was earned. */
  earnedAt: ReadonlyMap<string, Date | string>;
  rarity: BadgeRarityReport | null;
}) {
  const tBadges = useTranslations("badges");
  const rarityOf = useRarityLabel(rarity);
  const emblemLabel = useEmblemLabel();
  return (
    <ul
      className={cn(
        "flex flex-wrap gap-x-8 gap-y-6",
        profileId && "gap-2 sm:gap-4",
      )}
    >
      {slugs.flatMap((slug) => {
        const badge = catalogBadge(slug);
        const at = earnedAt.get(slug);
        if (!badge || at === undefined) return [];
        const rare = rarityOf(slug);
        if (profileId) {
          return [
            <li key={slug} data-badge={slug} className="min-w-0">
              <Link
                href={badgeShareHref(profileId, slug)}
                className="border-border hover:bg-muted/60 focus-visible:ring-ring flex min-h-11 max-w-56 items-center gap-2.5 rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2"
              >
                <BadgeEmblem
                  subject={{ kind: "badge", slug }}
                  state={{ earned: true, earnedAt: at }}
                  size="sm"
                />
                <span className="min-w-0 wrap-break-word">
                  <span className="block font-medium">
                    {tBadges(badge.nameKey)}
                  </span>
                  {rare && (
                    <span className="text-muted-foreground block font-mono text-xs">
                      {rare}
                    </span>
                  )}
                </span>
              </Link>
            </li>,
          ];
        }
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
              label={emblemLabel(
                { kind: "badge", slug },
                { earned: true, earnedAt: at },
              )}
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
