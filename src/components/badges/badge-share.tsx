import { useFormatter, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { getInitials } from "@/lib/avatar";
import type { CatalogBadge } from "@/lib/badges/catalog";
import { profileTabHref } from "@/lib/member-profile-routes";
import type { BadgeRarityReport } from "@/server/badges/rarity";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

import { BadgeEmblem } from "./badge-emblem";
import { useBadgeText } from "./use-badge-text";
import { useRarityLabel } from "./use-rarity-label";

/** Who is looking at a badge's share page, which decides its next step. */
export type BadgeShareViewer =
  | { kind: "owner" }
  | { kind: "member"; userId: string }
  | { kind: "guest" };

/**
 * A badge a member earned, as its share page shows it (the page people
 * reach from LinkedIn or X): the emblem large, what it is, when it was
 * earned and how rare it is, who earned it, and one next step for the
 * viewer. Server-renderable.
 */
export function BadgeShare({
  badge,
  earnedAt,
  member,
  rarity,
  viewer,
}: {
  badge: CatalogBadge;
  earnedAt: Date | string;
  member: { userId: string; displayName: string; avatarUrl: string | null };
  rarity: BadgeRarityReport | null;
  viewer: BadgeShareViewer;
}) {
  const t = useTranslations("badgeMoment");
  const format = useFormatter();
  const text = useBadgeText()(badge);
  const rarityLine = useRarityLabel(rarity)(badge.slug);
  const date = format.dateTime(new Date(earnedAt), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section
      aria-labelledby="badge-share-title"
      className="bg-card rounded-xl border p-6 sm:p-8"
    >
      <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-start sm:gap-8 sm:text-left">
        {/* The heading and facts beside it say everything the emblem does. */}
        <BadgeEmblem
          subject={{ kind: "badge", slug: badge.slug }}
          state={{ earned: true, earnedAt }}
          size="lg"
        />
        <div className="min-w-0 space-y-3">
          <div className="space-y-1.5">
            <h2
              id="badge-share-title"
              className="text-2xl font-semibold tracking-tight text-balance"
            >
              {text.name}
            </h2>
            <p className="text-muted-foreground font-mono text-xs">
              {text.kind}
            </p>
          </div>
          <p className="max-w-prose text-sm">{text.description}</p>
          <dl className="text-muted-foreground flex flex-wrap justify-center gap-x-4 gap-y-1 font-mono text-xs sm:justify-start">
            <div>
              <dt className="sr-only">{t("share.earnedLabel")}</dt>
              <dd>{t("earnedOn", { date })}</dd>
            </div>
            {rarityLine && (
              <div>
                <dt className="sr-only">{t("share.rarityLabel")}</dt>
                <dd>{rarityLine}</dd>
              </div>
            )}
          </dl>
          <p className="flex items-center justify-center gap-2 text-sm sm:justify-start">
            <span className="text-muted-foreground">{t("share.earnedBy")}</span>
            <Link
              href={profileTabHref(member.userId, "overview")}
              className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline"
            >
              <Avatar size="sm">
                {member.avatarUrl && (
                  <AvatarImage src={member.avatarUrl} alt="" />
                )}
                <AvatarFallback className="font-mono text-[10px]">
                  {getInitials(member.displayName)}
                </AvatarFallback>
              </Avatar>
              {member.displayName}
            </Link>
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3 border-t pt-6 sm:flex-row sm:justify-between">
        {viewer.kind === "guest" ? (
          <>
            <p className="text-muted-foreground max-w-prose text-center text-sm sm:text-left">
              {t("share.joinText")}
            </p>
            <Button asChild>
              <Link href="/join">{t("share.joinCta")}</Link>
            </Button>
          </>
        ) : (
          <>
            <Link
              href={profileTabHref(member.userId, "badges")}
              className="text-muted-foreground text-sm underline-offset-4 hover:underline"
            >
              {viewer.kind === "owner"
                ? t("share.ownerAllBadges")
                : t("share.allBadges", { name: member.displayName })}
            </Link>
            {viewer.kind === "member" && (
              <Button asChild variant="outline">
                <Link href={profileTabHref(viewer.userId, "badges")}>
                  {t("share.myBadgesCta")}
                </Link>
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
