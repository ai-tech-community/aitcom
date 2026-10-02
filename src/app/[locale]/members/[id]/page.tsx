import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { PROFILE_SETTINGS_HREF } from "@/lib/dashboard-routes";
import { profileTabHref } from "@/lib/member-profile-routes";
import {
  getMemberWork,
  profileTabMetadata,
  requireMemberProfile,
} from "@/server/members/profile-page";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { BadgeGrid } from "@/components/members/profile/badge-grid";
import { ProfileEmpty } from "@/components/members/profile/profile-empty";
import { recentWork } from "@/components/members/profile/work-entries";
import { WorkEntryList } from "@/components/members/profile/work-entry-list";
import { Button } from "@/components/ui/button";

/** Badges in the showcase: the most recent until members can pin them. */
const SHOWCASE_COUNT = 3;
const RECENT_WORK_COUNT = 3;

type Params = Promise<{ id: string; locale: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id, locale } = await params;
  return profileTabMetadata({ userId: id, locale, tab: "overview" });
}

function TabLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex min-h-8 items-center rounded-sm text-xs underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
    >
      {children}
    </Link>
  );
}

function SettingsAction({ children }: { children: string }) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={PROFILE_SETTINGS_HREF}>{children}</Link>
    </Button>
  );
}

export default async function MemberOverviewPage({
  params,
}: {
  params: Params;
}) {
  const { id, locale } = await params;
  const [data, work, t] = await Promise.all([
    requireMemberProfile(id),
    getMemberWork(id, locale),
    getTranslations("memberProfile.overview"),
  ]);
  const { profile } = data;
  const isOwner = data.audience === "owner";
  const showcase = data.badges.slice(0, SHOWCASE_COUNT);
  const recent = work ? recentWork(work, RECENT_WORK_COUNT) : [];

  return (
    <div className="space-y-10">
      <DashboardSection
        title={t("bio")}
        status={{ kind: profile.bio ? "ready" : "empty" }}
        empty={
          <ProfileEmpty
            isOwner={isOwner}
            title={t("bioEmptyOwnerTitle")}
            description={t("bioEmptyOwnerDescription")}
            action={<SettingsAction>{t("bioEmptyOwnerCta")}</SettingsAction>}
            visitorText={t("bioEmptyVisitor")}
          />
        }
      >
        <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line">
          {profile.bio}
        </p>
      </DashboardSection>

      <DashboardSection
        title={t("showcase")}
        action={
          showcase.length > 0 ? (
            <TabLink href={profileTabHref(id, "badges")}>
              {t("showcaseAll")}
            </TabLink>
          ) : undefined
        }
        status={{ kind: showcase.length > 0 ? "ready" : "empty" }}
        empty={
          <ProfileEmpty
            isOwner={isOwner}
            title={t("showcaseEmptyOwnerTitle")}
            description={t("showcaseEmptyOwnerDescription")}
            action={
              <Button asChild size="sm" variant="outline">
                <Link href={profileTabHref(id, "badges")}>
                  {t("showcaseEmptyOwnerCta")}
                </Link>
              </Button>
            }
            visitorText={t("showcaseEmptyVisitor")}
          />
        }
      >
        <BadgeGrid badges={showcase} size="lg" />
      </DashboardSection>

      <DashboardSection
        title={t("skills")}
        status={{ kind: profile.skills.length > 0 ? "ready" : "empty" }}
        empty={
          <ProfileEmpty
            isOwner={isOwner}
            title={t("skillsEmptyOwnerTitle")}
            description={t("skillsEmptyOwnerDescription")}
            action={<SettingsAction>{t("skillsEmptyOwnerCta")}</SettingsAction>}
            visitorText={t("skillsEmptyVisitor")}
          />
        }
      >
        <ul className="flex flex-wrap gap-2">
          {profile.skills.map((skill) => (
            <li
              key={skill}
              className="border-border rounded-full border px-2.5 py-0.5 text-xs"
            >
              {skill}
            </li>
          ))}
        </ul>
      </DashboardSection>

      <DashboardSection
        title={t("recentWork")}
        action={
          recent.length > 0 ? (
            <TabLink href={profileTabHref(id, "work")}>
              {t("recentWorkAll")}
            </TabLink>
          ) : undefined
        }
        status={{ kind: recent.length > 0 ? "ready" : "empty" }}
        empty={
          <ProfileEmpty
            isOwner={isOwner}
            title={t("recentWorkEmptyOwnerTitle")}
            description={t("recentWorkEmptyOwnerDescription")}
            visitorText={t("recentWorkEmptyVisitor")}
          />
        }
      >
        <WorkEntryList entries={recent} showKind />
      </DashboardSection>
    </div>
  );
}
