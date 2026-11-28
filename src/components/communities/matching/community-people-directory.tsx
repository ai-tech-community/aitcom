import { Suspense } from "react";
import { ArrowUpRight, ChevronDown, Users } from "lucide-react";
import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { MemberLoadError } from "@/components/members/member-load-error";
import { MemberSearchField } from "@/components/members/member-search-field";
import { SkillSearchField } from "@/components/members/skill-search-field";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { memberHeadline, rosterCaptions } from "@/lib/member-directory";
import type { SearchParamsRecord } from "@/lib/search-params-record";
import { getSession } from "@/server/better-auth/server";
import {
  loadCommunityRoster,
  loadCommunityRosterSkills,
  type PeopleFilters,
} from "@/server/communities/roster-read";
import { db } from "@/server/db";
import { api } from "@/trpc/server";
import { DirectoryMemberRow } from "./directory-member-row";

const PAGE_SIZE = 50;
const ROLES = ["owner", "admin", "moderator", "member"] as const;
type Filters = PeopleFilters & { q: string };

function textFilter(value: SearchParamsRecord[string]) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

function peopleHref(slug: string, { q, skill, role, offset }: Filters) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (skill) params.set("skill", skill);
  if (role) params.set("role", role);
  if (offset) params.set("offset", String(offset));
  const search = params.toString();
  return `/communities/${slug}/members${search ? `?${search}` : ""}`;
}

export async function CommunityPeopleDirectory({
  slug,
  search,
}: {
  slug: string;
  search: SearchParamsRecord;
}) {
  const [t, matching, roles, session, community] = await Promise.all([
    getTranslations("redesign.members"),
    getTranslations("communityMatching"),
    getTranslations("communities.roles"),
    getSession(),
    api.communities.getBySlug({ slug }).catch((error: unknown) => {
      if (error instanceof TRPCError && error.code === "NOT_FOUND") notFound();
      console.error("Community roster metadata failed to load", error);
      return null;
    }),
  ]);
  if (community?.memberCount == null) return <MemberLoadError />;

  const offset = Number(textFilter(search.offset));
  const filters: Filters = {
    q: textFilter(search.q),
    role: ROLES.find((role) => role === search.role),
    skill: textFilter(search.skill),
    offset:
      Number.isSafeInteger(offset) && offset > 0 && offset % PAGE_SIZE === 0
        ? offset
        : 0,
  };
  const viewerId = session?.user.id ?? null;
  const filtered = [filters.q, filters.skill, filters.role].some(Boolean);
  const label = t("directory");

  return (
    <div className="mx-auto max-w-4xl pb-6 lg:pt-2">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:gap-x-6">
        <h1 className="font-community-heading text-3xl font-semibold tracking-tight wrap-break-word sm:text-4xl">
          {matching("title")}
        </h1>
        <Button
          asChild
          variant="ghost"
          className="min-h-11 max-w-48 px-0 text-right whitespace-normal hover:bg-transparent hover:underline"
        >
          <Link href="/members">
            {t("browseHub")}
            <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        </Button>
        <p className="text-muted-foreground col-span-full max-w-prose text-sm leading-relaxed sm:text-base">
          {t("peopleDescription")}
        </p>
      </header>

      <form
        key={`filters:${peopleHref(slug, filters)}`}
        role="search"
        aria-label={matching("searchMembers")}
        className="mt-4 flex flex-wrap items-center gap-2"
      >
        <div className="w-full sm:min-w-40 sm:flex-1">
          <MemberSearchField
            label={matching("searchMembers")}
            name="q"
            maxLength={100}
            defaultValue={filters.q}
            placeholder={t("peopleSearch")}
          />
        </div>
        <SkillSearchField
          label={t("skill")}
          defaultValue={filters.skill}
          suggestions={loadCommunityRosterSkills(
            db,
            community.id,
            viewerId,
          ).catch((error: unknown) => {
            console.error("Community roster skills failed to load", error);
            return [];
          })}
        />
        <div className="relative min-w-0">
          <select
            name="role"
            defaultValue={filters.role ?? ""}
            aria-label={t("filterRole")}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 max-w-full appearance-none rounded-md border py-2 ps-3 pe-9 text-base outline-none focus-visible:ring-[3px] sm:text-sm"
          >
            <option value="">{t("allRoles")}</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {roles(role)}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute inset-e-3 top-1/2 size-4 -translate-y-1/2"
          />
        </div>
        <Button type="submit" variant="ink" className="min-h-11">
          {t("search")}
        </Button>
        {filtered && (
          <Button asChild variant="ghost" className="min-h-11">
            <Link href={`/communities/${slug}/members`}>
              {t("clearFilters")}
            </Link>
          </Button>
        )}
      </form>

      <Suspense
        key={peopleHref(slug, filters)}
        fallback={
          <div aria-label={label} aria-busy="true" className="mt-4 space-y-3">
            <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
            {[0, 1, 2].map((row) => (
              <Skeleton
                key={row}
                className="h-12 w-full motion-reduce:animate-none"
              />
            ))}
          </div>
        }
      >
        <CommunityRoster
          slug={slug}
          communityId={community.id}
          communityCreatedAt={community.createdAt}
          filters={filters}
          filtered={filtered}
          total={community.memberCount}
          viewerId={viewerId}
        />
      </Suspense>
    </div>
  );
}

async function CommunityRoster({
  slug,
  communityId,
  communityCreatedAt,
  filters,
  filtered,
  total,
  viewerId,
}: {
  slug: string;
  communityId: string;
  communityCreatedAt: Date;
  filters: Filters;
  filtered: boolean;
  total: number;
  viewerId: string | null;
}) {
  const [t, matching, roles, result] = await Promise.all([
    getTranslations("redesign.members"),
    getTranslations("communityMatching"),
    getTranslations("communities.roles"),
    loadCommunityRoster(db, {
      communityId,
      viewerId,
      q: filters.q,
      people: filters,
      status: "active",
      limit: PAGE_SIZE,
    }).catch((error: unknown) => {
      console.error("Community roster failed to load", error);
      return null;
    }),
  ]);
  if (!result) return <MemberLoadError />;
  const { items, nextCursor } = result;
  const { offset } = filters;
  const captions = rosterCaptions(
    items.map((member) => ({
      userId: member.userId,
      name: member.displayName ?? matching("memberFallback"),
      headline: memberHeadline(member.profile?.company, member.bio),
      role: roles(member.role),
      joinedAt: member.joinedAt,
    })),
  );

  return (
    <section className="mt-4" aria-labelledby="community-roster">
      <div className="border-border flex items-center justify-between gap-2 border-b pb-2">
        <SectionLabel id="community-roster" bordered={false}>
          {t("directory")}
        </SectionLabel>
        <span
          role="status"
          className="text-muted-foreground font-mono text-xs tabular-nums"
        >
          {t("shownOfTotal", { shown: items.length, total })}
        </span>
      </div>
      {items.length > 0 ? (
        <ul className="divide-border divide-y border-b">
          {items.map((member) => (
            <DirectoryMemberRow
              key={member.userId}
              member={member}
              viewerId={viewerId}
              communityCreatedAt={communityCreatedAt}
              caption={captions.get(member.userId)}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Users />}
          title={filtered ? matching("noMembers") : t("noDirectoryMembers")}
          description={
            filtered ? t("noMatches") : t("noDirectoryMembersDescription")
          }
          action={
            <Button asChild variant="outline" className="min-h-11 shadow-none">
              {filtered ? (
                <Link href={`/communities/${slug}/members`}>
                  {t("clearFilters")}
                </Link>
              ) : (
                <Link href={`/communities/${slug}`}>{t("communityHome")}</Link>
              )}
            </Button>
          }
        />
      )}
      {(offset > 0 || nextCursor) && (
        <nav
          aria-label={t("resultPages")}
          className="mt-4 flex flex-wrap gap-2"
        >
          {offset > 0 && (
            <Button asChild variant="outline" className="min-h-11 shadow-none">
              <Link
                href={peopleHref(slug, {
                  ...filters,
                  offset: offset - PAGE_SIZE,
                })}
              >
                {t("previousPage")}
              </Link>
            </Button>
          )}
          {nextCursor && (
            <Button asChild variant="outline" className="min-h-11 shadow-none">
              <Link
                href={peopleHref(slug, {
                  ...filters,
                  offset: offset + PAGE_SIZE,
                })}
              >
                {t("nextPage")}
              </Link>
            </Button>
          )}
        </nav>
      )}
    </section>
  );
}
