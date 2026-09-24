import { Link } from "@/i18n/navigation";
import { PromoteJoinCta } from "@/components/join/promote-join-cta";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import { StartupsJobsFilters } from "@/components/investigations/startups-jobs-filters";
import { StartupsJobsFollow } from "@/components/investigations/startups-jobs-follow";
import { StartupsJobsList } from "@/components/investigations/startups-jobs-list";
import { StartupsTabs } from "@/components/investigations/startups-tabs";
import {
  STARTUPS_JOIN_HREF,
  STARTUPS_PATH,
  buildStartupJobsPath,
  buildStartupRolePath,
} from "@/lib/investigations/startups";
import {
  applyStartupJobsQuery,
  paginateStartupRoles,
  startupJobsFacets,
  type StartupJobsFollow,
  type StartupJobsQuery,
  type StartupRoleListing,
  type StartupRoleTextMatches,
} from "@/lib/investigations/startup-roles";

export type StartupJobsNewRole = {
  slug: string;
  title: string;
  startupName: string;
};

export type StartupsJobsKey =
  | "kicker"
  | "jobsTitle"
  | "jobsLead"
  | "jobsLead2"
  | "joinCta"
  | "hubCta"
  | "tabDirectory"
  | "tabInsights"
  | "tabJobs"
  | "tabNav"
  | "jobsEmpty"
  | "jobsEmptyHelp"
  | "jobsSearch"
  | "jobsFilterCompany"
  | "jobsFilterCompanyAll"
  | "jobsFilterLocation"
  | "jobsFilterLocationAll"
  | "jobsFilterWorkType"
  | "jobsFilterWorkTypeAll"
  | "jobsSortMatch"
  | "jobsSortRole"
  | "jobsSortCompany"
  | "jobsSortLocation"
  | "jobsEmptyFiltered"
  | "jobsFilterClearHelp"
  | "jobsFollow"
  | "jobsFollowing"
  | "jobsUnfollow"
  | "jobsFollowHelp"
  | "jobsNewSince"
  | "jobsNewBadge"
  | "jobsRemote"
  | "jobsLocationRemote"
  | "jobsTry"
  | "jobsResults"
  | "jobsCompanyRoles"
  | "jobsTrack"
  | "jobsTracking"
  | "openOriginal"
  | "filtersToggle"
  | "clearFilters"
  | "paginationPrev"
  | "paginationNext"
  | "paginationLabel"
  | "howWeListJobs";

export function StartupsJobsPage({
  locale,
  t,
  roles,
  textMatches = null,
  query,
  promoteJoin = true,
  follow = null,
  following = false,
  newRoles = [],
  trackedRoleIds = [],
}: {
  locale: string;
  t: (key: StartupsJobsKey, values?: Record<string, string | number>) => string;
  roles: StartupRoleListing[];
  /** Full-text index matches for `query.q`; `null` when there is no search. */
  textMatches?: StartupRoleTextMatches;
  query: StartupJobsQuery;
  promoteJoin?: boolean;
  follow?: StartupJobsFollow | null;
  following?: boolean;
  newRoles?: StartupJobsNewRole[];
  trackedRoleIds?: readonly string[];
}) {
  const copyLocale = locale === "nl" ? "nl" : "en";
  const filtered = applyStartupJobsQuery(roles, query, textMatches);
  const pagination = paginateStartupRoles(filtered, query.page);
  const facets = startupJobsFacets(roles);
  const companyTotals = new Map<string, number>();
  for (const role of filtered) {
    companyTotals.set(
      role.startupSlug,
      (companyTotals.get(role.startupSlug) ?? 0) + 1,
    );
  }
  const pageQuery = {
    company: query.company || null,
    q: query.q || null,
    location: query.location || null,
    workType: query.workType || null,
    sort: query.sort,
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <SectionLabel as="div">{t("kicker")}</SectionLabel>

      <div className="mt-6 flex max-w-2xl flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("jobsTitle")}
        </h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          {t("jobsLead")}
        </p>
        <p className="text-muted-foreground text-base leading-relaxed">
          {t("jobsLead2")}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <StartupsTabs
          active="jobs"
          directoryLabel={t("tabDirectory")}
          insightsLabel={t("tabInsights")}
          jobsLabel={t("tabJobs")}
          navLabel={t("tabNav")}
        />
        <PromoteJoinCta
          promoteJoin={promoteJoin}
          guestHref={STARTUPS_JOIN_HREF}
          guestLabel={t("joinCta")}
          hubLabel={t("hubCta")}
          variant="outline"
        />
      </div>

      <div className="mt-10">
        <StartupsJobsFilters
          query={query}
          locale={copyLocale}
          companies={facets.companies}
          locations={facets.locations}
          workTypes={facets.workTypes}
          labels={{
            search: t("jobsSearch"),
            company: t("jobsFilterCompany"),
            companyAll: t("jobsFilterCompanyAll"),
            location: t("jobsFilterLocation"),
            locationAll: t("jobsFilterLocationAll"),
            locationRemote: t("jobsLocationRemote"),
            workType: t("jobsFilterWorkType"),
            workTypeAll: t("jobsFilterWorkTypeAll"),
            sortMatch: t("jobsSortMatch"),
            sortRole: t("jobsSortRole"),
            sortCompany: t("jobsSortCompany"),
            sortLocation: t("jobsSortLocation"),
            filters: t("filtersToggle"),
            remoteToggle: t("jobsRemote"),
            tryLabel: t("jobsTry"),
            results: t("jobsResults", {
              roles: filtered.length,
              companies: companyTotals.size,
            }),
            clear: t("clearFilters"),
          }}
          aside={
            follow ? (
              <StartupsJobsFollow
                follow={follow}
                following={following}
                labels={{
                  follow: t("jobsFollow"),
                  following: t("jobsFollowing"),
                  unfollow: t("jobsUnfollow"),
                  help: t("jobsFollowHelp"),
                }}
              />
            ) : null
          }
        />
      </div>

      {newRoles.length > 0 ? (
        <section
          aria-labelledby="jobs-new"
          data-startup-jobs-new=""
          className="border-border mt-6 flex flex-col gap-3 rounded-xl border p-4"
        >
          <SectionLabel as="h2" id="jobs-new" bordered={false}>
            {t("jobsNewSince")}
          </SectionLabel>
          <ul className="flex flex-col gap-1.5 text-sm">
            {newRoles.slice(0, 8).map((role) => (
              <li key={role.slug} className="flex flex-wrap gap-x-2">
                <Link
                  href={buildStartupRolePath(role.slug)}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {role.title}
                </Link>
                <span className="text-muted-foreground">
                  {role.startupName}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        {pagination.items.length === 0 ? (
          <EmptyState
            title={roles.length === 0 ? t("jobsEmpty") : t("jobsEmptyFiltered")}
            description={
              roles.length === 0 ? t("jobsEmptyHelp") : t("jobsFilterClearHelp")
            }
          />
        ) : (
          <StartupsJobsList
            roles={pagination.items}
            grouped={query.sort === "company"}
            locale={copyLocale}
            companyTotals={companyTotals}
            newSlugs={new Set(newRoles.map((role) => role.slug))}
            trackedIds={new Set(trackedRoleIds)}
            canTrack={!promoteJoin}
            copy={{
              caption: t("jobsTitle"),
              remote: t("jobsRemote"),
              newBadge: t("jobsNewBadge"),
              original: t("openOriginal"),
              track: t("jobsTrack"),
              tracking: t("jobsTracking"),
              companyRoles: (count) => t("jobsCompanyRoles", { count }),
            }}
          />
        )}
        {pagination.totalPages > 1 ? (
          <nav
            aria-label={t("paginationLabel")}
            className="mt-6 flex flex-wrap items-center justify-center gap-3 font-mono text-xs tracking-wider"
          >
            {pagination.page > 1 ? (
              <Link
                href={buildStartupJobsPath({
                  ...pageQuery,
                  page: pagination.page - 1,
                })}
                className="border-border hover:bg-muted/50 rounded-md border px-3 py-1.5 transition-colors"
              >
                ← {t("paginationPrev")}
              </Link>
            ) : null}
            <span className="text-muted-foreground tabular-nums">
              {pagination.page} / {pagination.totalPages}
            </span>
            {pagination.page < pagination.totalPages ? (
              <Link
                href={buildStartupJobsPath({
                  ...pageQuery,
                  page: pagination.page + 1,
                })}
                className="border-border hover:bg-muted/50 rounded-md border px-3 py-1.5 transition-colors"
              >
                {t("paginationNext")} →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>

      <p className="text-muted-foreground mt-16 text-sm leading-relaxed">
        {t("howWeListJobs")}{" "}
        <Link href={STARTUPS_PATH} className="hover:underline">
          {t("tabDirectory")}
        </Link>
        .
      </p>
    </main>
  );
}
