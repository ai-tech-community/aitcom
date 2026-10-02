import type { ReactNode } from "react";

import type { BadgeSlug } from "@/lib/badges/catalog";
import { BadgeEmblem } from "@/components/badges/badge-emblem";
import { useEmblemLabel } from "@/components/badges/use-emblem-label";

/**
 * A roster row's badges: up to three small emblems of the member's rarest
 * badges, then the count. A server component: the roster renders every
 * row twice (mobile and desktop), so nothing here hydrates. The roster carries no earned dates, so each
 * emblem is named by badge alone (an earned emblem without a date would
 * misstate it); the count says how many there are in all.
 */
export function RosterBadges({
  slugs,
  label,
  children,
}: {
  slugs: readonly BadgeSlug[];
  /** Accessible name of the emblem list ("Rarest badges"). */
  label: string;
  /** The count, as the row shows it. */
  children: ReactNode;
}) {
  const emblemLabel = useEmblemLabel();
  return (
    <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-xs">
      {slugs.length > 0 && (
        <span role="list" aria-label={label} className="inline-flex gap-1">
          {slugs.map((slug) => (
            <span role="listitem" key={slug} className="inline-flex">
              <BadgeEmblem
                subject={{ kind: "badge", slug }}
                state={{ earned: true, earnedAt: null }}
                size="sm"
                label={emblemLabel(
                  { kind: "badge", slug },
                  { earned: true, earnedAt: null },
                )}
              />
            </span>
          ))}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
}
