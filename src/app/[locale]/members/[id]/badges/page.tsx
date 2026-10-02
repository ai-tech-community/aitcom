import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import {
  profileTabMetadata,
  requireMemberProfile,
} from "@/server/members/profile-page";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { BadgeGrid } from "@/components/members/profile/badge-grid";
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

/** Every badge the member earned, newest first; the count is the grid's. */
export default async function MemberBadgesPage({ params }: { params: Params }) {
  const { id } = await params;
  const [data, t] = await Promise.all([
    requireMemberProfile(id),
    getTranslations("memberProfile.badges"),
  ]);
  const { badges } = data;

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
      status={{ kind: badges.length > 0 ? "ready" : "empty" }}
      empty={
        <ProfileEmpty
          isOwner={data.audience === "owner"}
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
      <BadgeGrid badges={badges} />
    </DashboardSection>
  );
}
