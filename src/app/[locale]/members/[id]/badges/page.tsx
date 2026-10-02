import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import {
  getBadgeRarityReport,
  getMemberAwards,
  getMyBadgeProgress,
  profileTabMetadata,
  requireMemberProfile,
} from "@/server/members/profile-page";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { BadgesTab } from "@/components/members/profile/badges-tab";
import { ProfileEmpty } from "@/components/members/profile/profile-empty";
import { Button } from "@/components/ui/button";

type Params = Promise<{ id: string; locale: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id, locale } = await params;
  return profileTabMetadata({ userId: id, locale, tab: "badges" });
}

/** Logs a failed supplementary load and carries on without it. */
function orNull<T>(load: Promise<T>, label: string): Promise<T | null> {
  return load.catch((error: unknown) => {
    console.error(`Profile badges: ${label} failed to load`, error);
    return null;
  });
}

/**
 * Every badge the member earned, by kind, with date and rarity; the count
 * is the badges shown. The owner also sees locked tiers with their own
 * progress (never requested for a visitor) and pins the showcase.
 */
export default async function MemberBadgesPage({ params }: { params: Params }) {
  const { id } = await params;
  const [data, t] = await Promise.all([
    requireMemberProfile(id),
    getTranslations("memberProfile.badges"),
  ]);
  const isOwner = data.audience === "owner";

  // Rarity and awards are supplementary: a failure drops them, not the tab.
  const [rarity, awards, progress] = await Promise.all([
    orNull(getBadgeRarityReport(), "rarity"),
    orNull(getMemberAwards(id), "awards"),
    isOwner ? orNull(getMyBadgeProgress(), "progress") : null,
  ]);
  const shownAwards = awards ?? [];
  const { badges } = data;
  const isEmpty = !isOwner && badges.length === 0 && shownAwards.length === 0;

  return (
    <DashboardSection
      title={t("title")}
      action={
        badges.length > 0 ? (
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {t("count", { count: badges.length })}
          </span>
        ) : undefined
      }
      status={{ kind: isEmpty ? "empty" : "ready" }}
      empty={
        <ProfileEmpty
          isOwner={isOwner}
          title={t("emptyOwnerTitle")}
          description={t("emptyOwnerDescription")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/events">{t("emptyOwnerCta")}</Link>
            </Button>
          }
          visitorText={t("emptyVisitor")}
        />
      }
    >
      <BadgesTab
        held={badges}
        awards={shownAwards}
        rarity={rarity}
        viewer={
          isOwner
            ? { kind: "owner", progress: progress ?? [] }
            : { kind: "visitor" }
        }
        showcase={data.showcase}
      />
    </DashboardSection>
  );
}
