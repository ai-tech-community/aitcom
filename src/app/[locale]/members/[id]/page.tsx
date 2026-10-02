import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { PROFILE_SETTINGS_HREF } from "@/lib/dashboard-routes";
import { profileTabHref } from "@/lib/member-profile-routes";
import {
  getBadgeRarityReport,
  getMemberRecentWork,
  profileTabMetadata,
  requireMemberFrame,
} from "@/server/members/profile-page";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { BadgeShowcase } from "@/components/members/profile/badge-showcase";
import { ProfileEmpty } from "@/components/members/profile/profile-empty";
import { recentWork } from "@/components/members/profile/work-entries";
import { RECENT_WORK_LIMIT } from "@/server/members/profile-work";
import { WorkEntryList } from "@/components/members/profile/work-entry-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

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

/**
 * Recent work: supplementary, so it streams in after the rest of the
 * Overview and a failed load hides the section instead of failing the page.
 */
async function RecentWorkSection({
  userId,
  locale,
  isOwner,
}: {
  userId: string;
  locale: string;
  isOwner: boolean;
}) {
  const t = await getTranslations("memberProfile.overview");
  const work = await getMemberRecentWork(userId, locale).catch(
    (error: unknown) => {
      console.error("Profile recent work failed to load", error);
      return undefined;
    },
  );
  const recent = work ? recentWork(work, RECENT_WORK_LIMIT, new Date()) : [];

  return (
    <DashboardSection
      title={t("recentWork")}
      optional
      action={
        recent.length > 0 ? (
          <TabLink href={profileTabHref(userId, "work")}>
            {t("recentWorkAll")}
          </TabLink>
        ) : undefined
      }
      status={{
        kind: !work ? "error" : recent.length > 0 ? "ready" : "empty",
      }}
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
  );
}

export default async function MemberOverviewPage({
  params,
}: {
  params: Params;
}) {
  const { id, locale } = await params;
  const [frame, t, tSetup, rarity] = await Promise.all([
    requireMemberFrame(id),
    getTranslations("memberProfile.overview"),
    getTranslations("memberProfile.setup"),
    // Rarity is a caption: without it the showcase still shows the badges.
    getBadgeRarityReport().catch((error: unknown) => {
      console.error("Profile showcase rarity failed to load", error);
      return null;
    }),
  ]);

  if (frame.kind === "setup") {
    return (
      <EmptyState
        className="items-start px-0 py-4 text-left [&_p]:mx-0"
        title={tSetup("title")}
        description={tSetup("description")}
        action={
          <Button asChild size="sm" variant="outline">
            <Link href={PROFILE_SETTINGS_HREF}>{tSetup("cta")}</Link>
          </Button>
        }
      />
    );
  }

  const { data } = frame;
  const { profile, showcase } = data;
  const isOwner = data.audience === "owner";
  const earnedAt = new Map(data.badges.map((b) => [b.slug, b.earnedAt]));

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
          showcase.slugs.length > 0 ? (
            <TabLink href={profileTabHref(id, "badges")}>
              {t("showcaseAll")}
            </TabLink>
          ) : undefined
        }
        status={{ kind: showcase.slugs.length > 0 ? "ready" : "empty" }}
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
        <div className="space-y-4">
          <BadgeShowcase
            slugs={showcase.slugs}
            earnedAt={earnedAt}
            rarity={rarity}
          />
          {isOwner && showcase.source !== "pinned" && (
            <p className="text-muted-foreground text-xs">
              {showcase.source === "rarest"
                ? t("showcaseRarestHint")
                : t("showcaseRecentHint")}{" "}
              <Link
                href={profileTabHref(id, "badges")}
                className="text-foreground underline underline-offset-4"
              >
                {t("showcasePinCta")}
              </Link>
            </p>
          )}
        </div>
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

      <Suspense
        fallback={
          <DashboardSection
            title={t("recentWork")}
            status={{ kind: "loading" }}
          />
        }
      >
        <RecentWorkSection userId={id} locale={locale} isOwner={isOwner} />
      </Suspense>
    </div>
  );
}
