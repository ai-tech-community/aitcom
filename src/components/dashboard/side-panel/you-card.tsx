"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { api, type RouterOutputs } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/avatar";
import { PROFILE_SETTINGS_HREF } from "@/lib/dashboard-routes";
import { profileTabHref } from "@/lib/member-profile-routes";
import { xpForNextLevel } from "@/lib/gamification";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { VerifiedSocials } from "@/components/verified-socials";
import { BadgeEmblem } from "@/components/badges/badge-emblem";
import { useEmblemLabel } from "@/components/badges/use-emblem-label";
import {
  DashboardSection,
  SectionBody,
  statusFromQueries,
  type SectionStatus,
} from "@/components/dashboard/dashboard-section";
import { BoostLine } from "./boost-line";
import { StreakSummary } from "./streak-summary";
import { YouProgress, type EarnedBadge } from "./you-progress";

type MyProfile = RouterOutputs["members"]["getMyProfile"];

/** Badges in the card's compact row, newest first. */
const RECENT_BADGE_COUNT = 5;
type MyStreak = RouterOutputs["members"]["getMyStreak"];

function YouSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-1.5 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

/**
 * The member's own corner of the side panel: who they are, their level and
 * XP, their streak, a live boost, and the full progress view on demand.
 * Replaces the dashboard's separate profile, streak, points and boost widgets.
 *
 * The profile is the card's required data; the streak degrades to its own
 * row (loading or error with retry) so a failed streak never blanks the
 * card. The boost sits in the footer, so a live boost shows whatever state
 * the profile is in.
 */
export function YouCard({
  fallbackName,
  avatarUrl,
}: {
  /** Account name, shown until a profile display name exists. */
  fallbackName: string;
  /** Resolved on the server (GitHub image or Gravatar). */
  avatarUrl: string | null;
}) {
  const t = useTranslations("dashboard.you");
  const profileQuery = api.members.getMyProfile.useQuery();
  const streakQuery = api.members.getMyStreak.useQuery();
  const data = profileQuery.data;
  const profile = data?.profile ?? null;

  const editLink = profile ? (
    <Link
      href={PROFILE_SETTINGS_HREF}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex min-h-8 items-center rounded-sm text-xs underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
    >
      {t("editProfile")}
    </Link>
  ) : undefined;

  return (
    <DashboardSection
      variant="card"
      title={t("title")}
      action={editLink}
      status={statusFromQueries(profileQuery, { isEmpty: !profile })}
      skeleton={<YouSkeleton />}
      empty={
        <EmptyState
          className="px-0 py-4"
          title={t("noProfileTitle")}
          description={t("noProfileDescription")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={PROFILE_SETTINGS_HREF}>{t("noProfileCta")}</Link>
            </Button>
          }
        />
      }
      footer={<BoostLine />}
    >
      {data && profile && (
        <YouSummary
          name={profile.displayName || fallbackName}
          avatarUrl={avatarUrl}
          company={profile.company}
          social={data.social}
          xp={profile.xp}
          level={profile.level}
          streak={streakQuery.data}
          streakStatus={statusFromQueries(streakQuery)}
          badges={data.badges}
          badgesHref={profileTabHref(profile.userId, "badges")}
        />
      )}
    </DashboardSection>
  );
}

function YouSummary({
  name,
  avatarUrl,
  company,
  social,
  xp,
  level,
  streak,
  streakStatus,
  badges,
  badgesHref,
}: {
  name: string;
  avatarUrl: string | null;
  company: string | null;
  social: MyProfile["social"];
  xp: number;
  level: number;
  streak: MyStreak | undefined;
  streakStatus: SectionStatus;
  badges: EarnedBadge[];
  /** The member's own Badges tab. */
  badgesHref: string;
}) {
  const t = useTranslations("dashboard.you");
  const tMembers = useTranslations("members");
  const emblemLabel = useEmblemLabel();
  const [progressOpen, setProgressOpen] = useState(false);
  const toNext = xpForNextLevel(xp);
  const percent = Math.round((toNext.current / toNext.needed) * 100);
  const xpToNextLabel = t("xpToNext", {
    current: toNext.current,
    needed: toNext.needed,
    next: level + 1,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-10">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback className="font-mono text-xs">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-0.5">
          <p className="truncate font-medium">{name}</p>
          <p className="text-muted-foreground font-mono text-xs">
            {t("level", { level })}
          </p>
          {company && (
            <p className="text-muted-foreground truncate text-xs">
              {t("company", { company })}
            </p>
          )}
          <VerifiedSocials
            compact
            className="pt-0.5"
            github={social.github}
            linkedin={social.linkedin}
            githubLabel={tMembers("github")}
            linkedinLabel={tMembers("linkedin")}
            verifiedLabel={tMembers("verified")}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Progress
          value={percent}
          aria-label={t("xpLabel", { next: level + 1 })}
          getValueLabel={() => xpToNextLabel}
          className="bg-muted h-1.5"
          indicatorClassName="bg-foreground motion-reduce:transition-none"
        />
        <p className="text-muted-foreground flex justify-between font-mono text-xs tabular-nums">
          <span>{t("xpTotal", { xp })}</span>
          <span aria-hidden>
            {toNext.current}/{toNext.needed}
          </span>
        </p>
      </div>

      <SectionBody status={streakStatus} size="compact">
        {streak && (
          <StreakSummary
            currentStreak={streak.currentStreak}
            periods={streak.streak}
          />
        )}
      </SectionBody>

      {badges.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <ul
            aria-label={t("recentBadges")}
            className="flex items-center gap-1.5"
          >
            {badges.slice(0, RECENT_BADGE_COUNT).map(({ slug, earnedAt }) => (
              <li key={slug} className="flex">
                <BadgeEmblem
                  subject={{ kind: "badge", slug }}
                  state={{ earned: true, earnedAt }}
                  size="sm"
                  label={emblemLabel(
                    { kind: "badge", slug },
                    { earned: true, earnedAt },
                  )}
                />
              </li>
            ))}
          </ul>
          <Link
            href={badgesHref}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex min-h-8 shrink-0 items-center rounded-sm text-xs underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
          >
            {t("allBadges")}
          </Link>
        </div>
      )}

      <Collapsible open={progressOpen} onOpenChange={setProgressOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="hover:text-foreground focus-visible:ring-ring/50 text-muted-foreground flex min-h-8 w-full items-center justify-between gap-2 rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-[3px]"
          >
            {progressOpen ? t("hideProgress") : t("seeProgress")}
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 transition-transform motion-reduce:transition-none",
                progressOpen && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-border mt-3 border-t pt-4">
          <YouProgress
            streak={streak}
            streakStatus={streakStatus}
            badges={badges}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
