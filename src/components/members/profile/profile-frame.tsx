import type { ReactNode } from "react";
import { ArrowLeft, CalendarDays, Clock3, Pencil } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { MessageMemberButton } from "@/components/message-member-button";
import { OwnerOnlyNotice } from "@/components/members/owner-only-notice";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { VerifiedSocials } from "@/components/verified-socials";
import { Link } from "@/i18n/navigation";
import { getInitials } from "@/lib/avatar";
import { PROFILE_SETTINGS_HREF } from "@/lib/dashboard-routes";
import { calculateLevel, tierForXp } from "@/lib/gamification";
import { memberHeadline } from "@/lib/member-directory";
import type { ProfileCommunity } from "@/server/members/profile-communities";
import {
  getMemberActivity,
  type MemberFrame,
} from "@/server/members/profile-page";

import { ProfileCommunityList } from "./identity-panel";
import { ProfileTabs } from "./profile-tabs";
import { XpProgress } from "./xp-progress";

export async function RedesignedProfileFrame({
  frame,
  userId,
  viewerSignedIn,
  showAgent,
  communities,
  children,
}: {
  frame: MemberFrame;
  userId: string;
  viewerSignedIn: boolean;
  showAgent: boolean;
  communities: readonly ProfileCommunity[];
  children: ReactNode;
}) {
  const t = await getTranslations("redesign.members");
  const data = frame.kind === "profile" ? frame.data : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 pb-12 sm:px-8 sm:pt-6">
      <Link
        href="/members"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mb-1 inline-flex min-h-11 items-center gap-2 rounded-md text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 sm:mb-2"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("hubTitle")}
      </Link>
      {data && <OwnerOnlyNotice reach={data.reach} />}
      <ProfileHeader frame={frame} viewerSignedIn={viewerSignedIn} />
      <div className="mt-3 sm:mt-4">
        <ProfileTabs
          userId={userId}
          showAgent={showAgent}
          hasProfile={data !== null}
          redesigned
        />
      </div>

      <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-10">
        <div className="[&_a:focus-visible]:ring-ring min-w-0 [&_[data-slot=button]]:min-h-11 sm:[&_[data-slot=button]]:min-h-9 [&_a:focus-visible]:ring-2 [&_a:focus-visible]:outline-none">
          {children}
        </div>
        {data && (
          <div className="border-border min-w-0 space-y-6 border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <ProfileCommunityList
              communities={communities}
              isOwner={data.audience === "owner"}
              redesigned
            />
            <ProfileProgress xp={data.profile.xp} />
          </div>
        )}
      </div>
    </div>
  );
}

async function ProfileHeader({
  frame,
  viewerSignedIn,
}: {
  frame: MemberFrame;
  viewerSignedIn: boolean;
}) {
  const data = frame.kind === "profile" ? frame.data : null;
  const [t, tMembers, redesign, format, activity] = await Promise.all([
    getTranslations("memberProfile"),
    getTranslations("members"),
    getTranslations("redesign.members"),
    getFormatter(),
    data
      ? getMemberActivity(data.profile.userId).catch((error: unknown) => {
          console.error("Member header activity failed to load", error);
          return null;
        })
      : null,
  ]);
  const name =
    frame.kind === "profile" ? frame.data.profile.displayName : frame.name;
  const avatarUrl =
    frame.kind === "profile"
      ? (frame.data.user?.avatarUrl ?? frame.data.user?.image)
      : frame.avatarUrl;
  const websiteUrl = data?.social.website?.url ?? data?.profile.websiteUrl;
  const headline = memberHeadline(data?.profile.company, data?.profile.bio);
  const lastActiveDay = activity?.days.at(-1);
  const today = new Date().toISOString().slice(0, 10);
  const lastActive = lastActiveDay
    ? lastActiveDay === today
      ? redesign("profileActiveToday")
      : redesign("profileActive", {
          when: format.relativeTime(new Date(`${lastActiveDay}T00:00:00Z`), {
            now: new Date(`${today}T00:00:00Z`),
            unit: "day",
          }),
        })
    : null;

  return (
    <header className="border-border bg-muted/35 rounded-xl border p-4 sm:p-7">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-5">
        <Avatar
          aria-hidden
          className="border-border bg-background size-16 border sm:size-20"
        >
          {avatarUrl && (
            <AvatarImage src={avatarUrl} alt="" className="object-cover" />
          )}
          <AvatarFallback className="bg-background text-foreground text-xl font-medium sm:text-2xl">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight wrap-break-word sm:text-4xl">
            {name}
          </h1>
          {headline && (
            <p
              dir="auto"
              className="mt-1 max-w-prose text-sm wrap-break-word sm:text-base"
            >
              {headline}
            </p>
          )}
          {data && (
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm">
              {lastActive && (
                <p className="flex items-center gap-1.5">
                  <Clock3 aria-hidden className="size-3.5 shrink-0" />
                  <time dateTime={lastActiveDay}>{lastActive}</time>
                </p>
              )}
              <p className="flex items-center gap-1.5">
                <CalendarDays aria-hidden className="size-3.5 shrink-0" />
                {t("memberSince", {
                  date: format.dateTime(data.profile.createdAt, {
                    month: "long",
                    year: "numeric",
                  }),
                })}
              </p>
            </div>
          )}
        </div>
        {data && (data.audience === "owner" || viewerSignedIn) && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {data.audience === "owner" ? (
              <Button
                asChild
                variant="outline"
                className="min-h-11 shadow-none"
              >
                <Link href={PROFILE_SETTINGS_HREF}>
                  <Pencil aria-hidden className="size-4" />
                  {t("editProfile")}
                </Link>
              </Button>
            ) : (
              <MessageMemberButton
                recipientId={data.profile.userId}
                recipientName={name}
                prominent
              />
            )}
          </div>
        )}
      </div>
      {data && (
        <VerifiedSocials
          github={data.social.github}
          linkedin={data.social.linkedin}
          websiteUrl={websiteUrl}
          githubLabel={tMembers("github")}
          linkedinLabel={tMembers("linkedin")}
          websiteLabel={tMembers("website")}
          verifiedLabel={tMembers("verified")}
          className="mt-2 empty:hidden sm:pl-[6.25rem] [&_a]:min-h-11 [&_a]:min-w-11 [&_a]:justify-center"
        />
      )}
    </header>
  );
}

async function ProfileProgress({ xp }: { xp: number }) {
  const [t, profile, tiers] = await Promise.all([
    getTranslations("redesign.members"),
    getTranslations("memberProfile"),
    getTranslations("tiers"),
  ]);
  return (
    <section aria-labelledby="profile-progression" className="space-y-3">
      <SectionLabel id="profile-progression">
        {t("profileProgress")}
      </SectionLabel>
      <p className="text-sm font-medium">
        {profile("levelTier", {
          level: calculateLevel(xp),
          tier: tiers(tierForXp(xp).key),
        })}
      </p>
      <XpProgress xp={xp} />
    </section>
  );
}
