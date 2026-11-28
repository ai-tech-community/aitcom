import { Suspense } from "react";
import { ArrowDown, Bot, Search, Users } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { RosterBadges } from "@/components/members/roster-badges";
import { RosterAvatar } from "@/components/members/roster-avatar";
import { RosterCaptionText } from "@/components/members/roster-caption";
import { RosterMessageAction } from "@/components/members/roster-message-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { VerifiedSocials } from "@/components/verified-socials";
import { Link } from "@/i18n/navigation";
import {
  rosterCaptions,
  rosterSubtitle,
  type RosterCaption,
} from "@/lib/member-directory";
import { profileTabHref } from "@/lib/member-profile-routes";
import { cn } from "@/lib/utils";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import {
  loadPublicRoster,
  loadPublicRosterSkills,
  type PresentedRosterEntry,
  type PublicRosterView,
} from "@/server/members/public-roster-read";
import { leaderboardSkills } from "@/server/social/present";

import { MemberLoadError } from "./member-load-error";
import { MemberSearchField } from "./member-search-field";
import { SkillSearchField } from "./skill-search-field";

const PAGE_SIZE = 50;

type RosterFilters = {
  q: string;
  skill: string;
  offset: number;
  view: PublicRosterView;
};

function rosterHref({ q, skill, offset, view }: RosterFilters) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (skill) params.set("skill", skill);
  if (view === "leaderboard") params.set("view", view);
  if (offset) params.set("offset", String(offset));
  const query = params.toString();
  return query ? `/members?${query}` : "/members";
}

function filterText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

export async function HubMembersDirectory({
  q,
  skill,
  offset,
  view,
}: {
  q?: string;
  skill?: string;
  offset?: string;
  view?: string;
}) {
  const t = await getTranslations("redesign.members");
  const cursor = typeof offset === "string" ? Number(offset) : 0;
  const filters: RosterFilters = {
    view: view === "leaderboard" ? "leaderboard" : "directory",
    q: filterText(q),
    skill: filterText(skill),
    offset:
      Number.isSafeInteger(cursor) && cursor > 0 && cursor % PAGE_SIZE === 0
        ? cursor
        : 0,
  };
  const hasFilters = Boolean(filters.q || filters.skill);
  const href = rosterHref(filters);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-12 sm:px-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("hubTitle")}
        </h1>
        <p className="text-muted-foreground max-w-prose text-sm leading-relaxed sm:text-base">
          {t("hubDescription")}
        </p>
      </header>

      <nav
        aria-label={t("rosterViews")}
        className="border-border mt-3 flex flex-wrap gap-4 border-b"
      >
        {(["directory", "leaderboard"] as const).map((view) => (
          <Link
            key={view}
            href={rosterHref({ ...filters, view, offset: 0 })}
            aria-current={view === filters.view ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring -mb-px inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset",
              view === filters.view
                ? "border-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t(view === "leaderboard" ? "xpLeaderboard" : "directory")}
          </Link>
        ))}
      </nav>

      <form
        key={`filters:${href}`}
        role="search"
        aria-label={t("hubSearch")}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        {filters.view === "leaderboard" && (
          <input type="hidden" name="view" value="leaderboard" />
        )}
        <div className="w-full sm:min-w-60 sm:flex-1">
          <MemberSearchField
            label={t("nameOrCompany")}
            name="q"
            maxLength={100}
            defaultValue={filters.q}
            placeholder={t("nameOrCompany")}
          />
        </div>
        <SkillSearchField
          label={t("skill")}
          defaultValue={filters.skill}
          suggestions={loadPublicRosterSkills(db).catch((error: unknown) => {
            console.error("Hub member skills failed to load", error);
            return [];
          })}
        />
        <Button type="submit" variant="ink" className="min-h-11">
          <Search aria-hidden className="size-4 sm:hidden" />
          {t("search")}
        </Button>
        {hasFilters && (
          <Button asChild variant="ghost" className="min-h-11">
            <Link
              href={rosterHref({ ...filters, q: "", skill: "", offset: 0 })}
            >
              {t("clearFilters")}
            </Link>
          </Button>
        )}
      </form>

      <Suspense key={href} fallback={<HubRosterSkeleton />}>
        <HubRoster filters={filters} />
      </Suspense>
    </div>
  );
}

function HubRosterSkeleton() {
  return (
    <div aria-busy="true" className="mt-6 space-y-3">
      <Skeleton className="h-4 w-28 motion-reduce:animate-none" />
      <Skeleton className="h-29 w-full motion-reduce:animate-none" />
      <Skeleton className="h-20 w-full motion-reduce:animate-none" />
    </div>
  );
}

async function HubRoster({ filters }: { filters: RosterFilters }) {
  const { q, skill, offset, view } = filters;
  const leaderboard = view === "leaderboard";
  const [t, roles, session, result] = await Promise.all([
    getTranslations("redesign.members"),
    getTranslations("communities.roles"),
    getSession(),
    loadPublicRoster(db, {
      limit: PAGE_SIZE,
      search: q || undefined,
      skill: skill || undefined,
      cursor: offset,
      view,
    }).catch((error: unknown) => {
      console.error("Hub members failed to load", error);
      return null;
    }),
  ]);

  if (!result) return <MemberLoadError />;

  const { items, nextCursor } = result;
  const identities = items.map((member) => ({
    userId: member.profile.userId,
    name: member.profile.displayName,
    headline: member.headline,
    role:
      member.community && member.community.role !== "member"
        ? roles(member.community.role)
        : null,
    community: member.community?.name,
    handle: member.social?.github?.handle ?? member.social?.linkedin?.handle,
    joinedAt: member.joinedAt,
  }));
  const captions = rosterCaptions(identities);
  const subtitles = new Map(
    identities.map((identity) => [identity.userId, rosterSubtitle(identity)]),
  );
  const filtered = Boolean(q || skill);
  const podium =
    leaderboard && !filtered && offset === 0 && items.length >= 3
      ? items.slice(0, 3)
      : [];
  const remaining = items.slice(podium.length);
  return (
    <section aria-labelledby="hub-roster" className="mt-4">
      <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <SectionLabel id="hub-roster" bordered={false}>
          {filtered
            ? t("results")
            : leaderboard
              ? t("leaderboard")
              : t("people")}
        </SectionLabel>
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          <ArrowDown aria-hidden className="size-3.5" />
          {t(leaderboard ? "rankedByXp" : q ? "relevance" : "recentActivity")}
        </span>
      </div>
      {podium.length > 0 && (
        <ol className="border-border divide-border grid divide-y border-b lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {podium.map((member, index) => (
            <HubRosterEntry
              key={member.profile.userId}
              member={member}
              caption={captions.get(member.profile.userId)}
              subtitle={subtitles.get(member.profile.userId)}
              rank={index + 1}
              featured
              filters={filters}
              viewerId={session?.user.id}
            />
          ))}
        </ol>
      )}
      {remaining.length > 0 && (
        <RosterList
          ranked={leaderboard && !filtered}
          start={offset + podium.length + 1}
          className="border-border divide-border divide-y border-b"
        >
          {remaining.map((member, index) => (
            <HubRosterEntry
              key={member.profile.userId}
              member={member}
              caption={captions.get(member.profile.userId)}
              subtitle={subtitles.get(member.profile.userId)}
              rank={
                leaderboard && !filtered
                  ? offset + podium.length + index + 1
                  : undefined
              }
              filters={filters}
              viewerId={session?.user.id}
            />
          ))}
        </RosterList>
      )}
      {items.length === 0 && (
        <EmptyState
          icon={<Users />}
          title={t("noHubMembers")}
          description={filtered ? t("noMatches") : t("hubEmpty")}
          action={
            <Button asChild variant="outline" className="min-h-11 shadow-none">
              {filtered ? (
                <Link
                  href={rosterHref({ ...filters, q: "", skill: "", offset: 0 })}
                >
                  {t("clearFilters")}
                </Link>
              ) : (
                <Link href="/communities">{t("exploreCommunities")}</Link>
              )}
            </Button>
          }
        />
      )}
      {(offset > 0 || nextCursor !== null) && (
        <nav
          aria-label={t("resultPages")}
          className="mt-4 flex flex-wrap gap-2"
        >
          {offset > 0 && (
            <Button asChild variant="outline" className="min-h-11 shadow-none">
              <Link
                href={rosterHref({
                  ...filters,
                  offset: Math.max(0, offset - PAGE_SIZE),
                })}
              >
                {t("previousPage")}
              </Link>
            </Button>
          )}
          {nextCursor !== null && (
            <Button asChild variant="outline" className="min-h-11 shadow-none">
              <Link href={rosterHref({ ...filters, offset: nextCursor })}>
                {t("nextPage")}
              </Link>
            </Button>
          )}
        </nav>
      )}
    </section>
  );
}

function RosterList({
  ranked,
  start,
  children,
  className,
}: {
  ranked: boolean;
  start: number;
  children: React.ReactNode;
  className: string;
}) {
  return ranked ? (
    <ol start={start} className={className}>
      {children}
    </ol>
  ) : (
    <ul className={className}>{children}</ul>
  );
}

async function HubRosterEntry({
  member,
  caption,
  subtitle,
  rank,
  featured = false,
  filters,
  viewerId,
}: {
  member: PresentedRosterEntry;
  caption?: RosterCaption;
  subtitle?: string | null;
  rank?: number;
  featured?: boolean;
  filters: RosterFilters;
  viewerId?: string;
}) {
  const [t, legacy, format] = await Promise.all([
    getTranslations("redesign.members"),
    getTranslations("members"),
    getFormatter(),
  ]);
  const { profile } = member;
  const skills = leaderboardSkills(profile.skills);
  const leaderboard = filters.view === "leaderboard";
  const message = (
    <RosterMessageAction
      memberId={profile.userId}
      name={profile.displayName}
      viewerId={viewerId}
    />
  );
  const hasDetails =
    leaderboard ||
    skills.length > 0 ||
    Boolean(member.social?.github ?? member.social?.linkedin);
  return (
    <li
      className={cn(
        "grid min-w-0 items-center gap-x-3 gap-y-1.5 py-2 sm:py-1.5",
        rank === undefined
          ? "grid-cols-[minmax(0,1fr)_auto]"
          : "grid-cols-[2rem_minmax(0,1fr)_auto]",
        featured ? "lg:bg-muted/35 lg:px-4 lg:py-4" : "sm:px-2",
        leaderboard &&
          !featured &&
          (rank === undefined
            ? "lg:grid-cols-[minmax(10rem,1fr)_minmax(0,1.2fr)_7rem]"
            : "lg:grid-cols-[2rem_minmax(10rem,1fr)_minmax(0,1.2fr)_7rem]"),
      )}
    >
      {rank !== undefined && (
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            featured ? "font-semibold" : "text-muted-foreground",
          )}
        >
          <span className="sr-only">{t("rank", { rank })}</span>
          <span aria-hidden>#{format.number(rank)}</span>
        </span>
      )}
      <Link
        href={profileTabHref(profile.userId, "overview")}
        className="group focus-visible:ring-ring flex min-h-11 min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 sm:min-h-9"
      >
        <RosterAvatar name={profile.displayName} image={member.avatarUrl} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="leading-tight font-semibold wrap-break-word underline-offset-4 group-hover:underline">
              {profile.displayName}
            </span>
            {member.hasAgent && (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <Bot aria-hidden className="size-3.5 shrink-0" />
                {t("hasAgent")}
              </span>
            )}
          </span>
          {(caption ?? subtitle) && (
            <span className="text-muted-foreground block text-sm wrap-break-word">
              {caption ? <RosterCaptionText caption={caption} /> : subtitle}
            </span>
          )}
        </span>
      </Link>
      {leaderboard ? (
        <div
          className={cn(
            "text-right font-mono tabular-nums",
            !featured &&
              (rank === undefined
                ? "lg:col-start-3 lg:row-start-1"
                : "lg:col-start-4 lg:row-start-1"),
          )}
        >
          <p
            className={cn(
              "whitespace-nowrap",
              featured ? "text-base font-semibold" : "text-sm font-medium",
            )}
          >
            {t("xp", { xp: format.number(profile.xp) })}
          </p>
          <p className="text-muted-foreground text-xs whitespace-nowrap">
            {t("level", { level: format.number(profile.level) })}
          </p>
        </div>
      ) : (
        message
      )}
      {hasDetails && (
        <div
          className={cn(
            "col-span-full flex flex-wrap items-center gap-x-3 gap-y-1",
            rank !== undefined && "pl-11",
            !leaderboard && "pl-12.5",
            leaderboard &&
              !featured &&
              "lg:col-span-1 lg:row-start-1 lg:justify-end lg:pl-0",
            leaderboard &&
              !featured &&
              (rank === undefined ? "lg:col-start-2" : "lg:col-start-3"),
          )}
        >
          <VerifiedSocials
            compact
            linked={false}
            github={member.social?.github ?? null}
            linkedin={member.social?.linkedin ?? null}
            githubLabel={legacy("github")}
            linkedinLabel={legacy("linkedin")}
            verifiedLabel={legacy("verified")}
          />
          {leaderboard && member.badgeCount > 0 && (
            <RosterBadges slugs={member.topBadges} label={legacy("topBadges")}>
              {legacy("badgeCount", { count: member.badgeCount })}
            </RosterBadges>
          )}
          {skills.map((skill) => (
            <Badge
              key={skill}
              variant="outline"
              asChild
              className="min-h-11 max-w-full whitespace-normal sm:min-h-8"
            >
              <Link href={rosterHref({ ...filters, skill, offset: 0 })}>
                {skill}
              </Link>
            </Badge>
          ))}
          {leaderboard && message}
        </div>
      )}
    </li>
  );
}
