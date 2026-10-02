import { createTranslator } from "next-intl";

import { catalogBadge, type BadgeSlug } from "@/lib/badges/catalog";
import { profileTabHref } from "@/lib/member-profile-routes";
import { clipText } from "@/lib/text-utils";
import { loadMessages } from "@/i18n/messages";
import { notifications } from "@/server/db/schema";

import type { BadgeDb } from "./metrics";

/**
 * The notification type for a badge a member just earned. Its metadata
 * carries `badgeSlug`; the earning moment celebrates a badge row only when
 * such a notification exists (`earning-moment.ts`).
 */
export const BADGE_EARNED_NOTIFICATION = "badge_earned";

/**
 * The notification type for an award a member just won in a challenge.
 * Its metadata carries `awardId`, the earning moment's marker for awards.
 */
export const AWARD_WON_NOTIFICATION = "award_won";

/** `notification.title` is varchar(255). */
const TITLE_MAX = 255;

/**
 * In-app notifications are stored as text in one language, like every
 * other notification type; English is the default locale.
 */
async function badgeTranslator() {
  return createTranslator({
    locale: "en",
    messages: await loadMessages("en"),
    namespace: "badges",
  });
}

/**
 * Tells a member they earned a badge ("You earned Writer II"), linking to
 * the Badges tab of their profile. The earning moment (slice 5) builds on
 * these rows.
 */
export async function notifyBadgesEarned(
  db: BadgeDb,
  userId: string,
  slugs: readonly BadgeSlug[],
): Promise<void> {
  const badges = slugs.flatMap((slug) => {
    const badge = catalogBadge(slug);
    return badge ? [badge] : [];
  });
  if (badges.length === 0) return;

  const t = await badgeTranslator();
  await db.insert(notifications).values(
    badges.map((badge) => ({
      userId,
      type: BADGE_EARNED_NOTIFICATION,
      title: clipText(
        t("notification.title", { badge: t(badge.nameKey) }),
        TITLE_MAX,
      ),
      content: t(badge.descriptionKey, badge.descriptionValues),
      metadata: {
        badgeSlug: badge.slug,
        reviewPath: profileTabHref(userId, "badges"),
        linkLabel: t("notification.linkLabel"),
      },
    })),
  );
}

/**
 * Tells a member they won a challenge's award ("You won an award"), linking
 * to the Badges tab of their profile. Created only for a live award (never
 * by the backfill), so the earning moment celebrates exactly these.
 */
export async function notifyAwardWon(
  db: BadgeDb,
  userId: string,
  award: { id: string; label: string },
): Promise<void> {
  const t = await badgeTranslator();
  await db.insert(notifications).values({
    userId,
    type: AWARD_WON_NOTIFICATION,
    title: clipText(t("notification.awardTitle"), TITLE_MAX),
    content: award.label,
    metadata: {
      awardId: award.id,
      reviewPath: profileTabHref(userId, "badges"),
      linkLabel: t("notification.linkLabel"),
    },
  });
}
