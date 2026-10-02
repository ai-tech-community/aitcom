import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { toStreakPeriods } from "@/lib/gamification";
import {
  getMemberActivity,
  profileTabMetadata,
  requireMemberProfile,
} from "@/server/members/profile-page";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { ActivityCalendar } from "@/components/members/profile/activity-calendar";
import { ProfileEmpty } from "@/components/members/profile/profile-empty";
import { Button } from "@/components/ui/button";

type Params = Promise<{ id: string; locale: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id, locale } = await params;
  return profileTabMetadata({ userId: id, locale, tab: "activity" });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-mono text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** The member's public year of activity: active days and streaks. */
export default async function MemberActivityPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const [data, activity, t] = await Promise.all([
    requireMemberProfile(id),
    getMemberActivity(id),
    getTranslations("memberProfile.activity"),
  ]);
  if (!activity) notFound();

  const days = activity.days;
  const periods = toStreakPeriods(days);

  return (
    <DashboardSection
      title={t("title")}
      status={{ kind: days.length > 0 ? "ready" : "empty" }}
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
      <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat
            label={t("currentStreak")}
            value={t("days", { count: activity.currentStreak })}
          />
          <Stat
            label={t("longestStreak")}
            value={t("days", { count: activity.longestStreak })}
          />
          <Stat
            label={t("activeDays")}
            value={t("days", { count: days.length })}
          />
        </dl>
        <ActivityCalendar periods={periods} />
        <p className="text-muted-foreground text-xs">{t("explainer")}</p>
      </div>
    </DashboardSection>
  );
}
