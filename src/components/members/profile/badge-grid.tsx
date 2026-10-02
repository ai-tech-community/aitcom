import { getTranslations } from "next-intl/server";

import { AchievementBadge } from "@/components/gamification/achievement-badge";
import { catalogBadge, type BadgeSlug } from "@/lib/badges/catalog";

/** Earned badges as a grid of AchievementBadge tiles, in the given order. */
export async function BadgeGrid({
  badges,
  size = "default",
}: {
  badges: readonly { slug: BadgeSlug; earnedAt: Date | string }[];
  size?: "default" | "lg";
}) {
  const t = await getTranslations("badges");
  return (
    <div
      role="list"
      className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3"
    >
      {badges.flatMap(({ slug, earnedAt }) => {
        const badge = catalogBadge(slug);
        return badge
          ? [
              <AchievementBadge
                key={badge.slug}
                badgeSize={size}
                achievement={{
                  id: badge.slug,
                  name: t(badge.nameKey),
                  trigger: "metric",
                  achievedAt: new Date(earnedAt).toISOString(),
                }}
              />,
            ]
          : [];
      })}
    </div>
  );
}
