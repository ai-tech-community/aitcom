import { getTranslations } from "next-intl/server";

import { AchievementBadge } from "@/components/gamification/achievement-badge";

/** Earned badges as a grid of AchievementBadge tiles, in the given order. */
export async function BadgeGrid({
  badges,
  size = "default",
}: {
  badges: readonly { slug: string; earnedAt: Date | string }[];
  size?: "default" | "lg";
}) {
  const t = await getTranslations("badges");
  return (
    <div
      role="list"
      className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3"
    >
      {badges.map((badge) => (
        <AchievementBadge
          key={badge.slug}
          badgeSize={size}
          achievement={{
            id: badge.slug,
            name: t(badge.slug),
            trigger: "metric",
            achievedAt: new Date(badge.earnedAt).toISOString(),
          }}
        />
      ))}
    </div>
  );
}
