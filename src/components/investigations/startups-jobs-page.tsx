import { Link } from "@/i18n/navigation";
import { PromoteJoinCta } from "@/components/join/promote-join-cta";
import { SectionLabel } from "@/components/ui/section-label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StartupsTabs } from "@/components/investigations/startups-tabs";
import {
  STARTUPS_JOIN_HREF,
  STARTUPS_PATH,
  buildStartupJobsPath,
  buildStartupProfilePath,
  buildStartupRolePath,
} from "@/lib/investigations/startups";
import {
  applyStartupJobsQuery,
  paginateStartupRoles,
  type StartupJobsQuery,
  type StartupRolePublic,
} from "@/lib/investigations/startup-roles";

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
  | "roleColumn"
  | "companyColumn"
  | "locationColumn"
  | "paginationPrev"
  | "paginationNext"
  | "paginationLabel"
  | "howWeListJobs";

export function StartupsJobsPage({
  t,
  roles,
  query,
  promoteJoin = true,
}: {
  locale: string;
  t: (key: StartupsJobsKey) => string;
  roles: StartupRolePublic[];
  query: StartupJobsQuery;
  promoteJoin?: boolean;
}) {
  const filtered = applyStartupJobsQuery(roles, query);
  const pagination = paginateStartupRoles(filtered, query.page);

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

      <section className="mt-10">
        {pagination.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("jobsEmpty")} {t("jobsEmptyHelp")}
          </p>
        ) : (
          <div className="border-border overflow-hidden rounded-xl border">
            <Table>
              <TableCaption className="sr-only">{t("jobsTitle")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                    {t("roleColumn")}
                  </TableHead>
                  <TableHead className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                    {t("companyColumn")}
                  </TableHead>
                  <TableHead className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                    {t("locationColumn")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.items.map((role) => (
                  <TableRow key={role.id} data-startup-role={role.slug}>
                    <TableCell>
                      <Link
                        href={buildStartupRolePath(role.slug)}
                        className="font-medium hover:underline"
                      >
                        {role.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={buildStartupProfilePath(role.startupSlug)}
                        className="hover:underline"
                      >
                        {role.startupName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {role.location ? (
                        <span data-startup-role-location="">
                          {role.location}
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {pagination.totalPages > 1 ? (
          <nav
            aria-label={t("paginationLabel")}
            className="mt-6 flex flex-wrap items-center justify-center gap-1.5 font-mono text-xs tracking-wider"
          >
            {pagination.page > 1 ? (
              <Link
                href={buildStartupJobsPath({
                  company: query.company || null,
                  q: query.q || null,
                  page: pagination.page - 1,
                })}
                className="border-border rounded border px-3 py-1.5"
              >
                ← {t("paginationPrev")}
              </Link>
            ) : null}
            {pagination.page < pagination.totalPages ? (
              <Link
                href={buildStartupJobsPath({
                  company: query.company || null,
                  q: query.q || null,
                  page: pagination.page + 1,
                })}
                className="border-border rounded border px-3 py-1.5"
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
