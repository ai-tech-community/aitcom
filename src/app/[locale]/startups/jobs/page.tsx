import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { StartupsJobsPage } from "@/components/investigations/startups-jobs-page";
import {
  STARTUPS_JOBS_PATH,
  buildStartupJobsPath,
  startupsPublicRobots,
} from "@/lib/investigations/startups";
import {
  applyStartupJobsQuery,
  paginateStartupRoles,
  parseStartupJobsQuery,
} from "@/lib/investigations/startup-roles";
import {
  absoluteLocaleUrl,
  localeAlternates,
  buildOgMeta,
} from "@/lib/metadata";
import {
  shouldPromoteJoin,
  toHubAuthUser,
} from "@/server/better-auth/hub-session";
import { getSession } from "@/server/better-auth/server";
import { listPublicStartupRoles } from "@/server/startups/queries";

export const dynamic = "force-dynamic";

const JOBS_H1 = "Open positions";
const JOBS_META =
  "Sourced openings from verified careers pages of listed AI startups. Original posting always linked. Not a size or salary scorecard.";

interface PageProps {
  searchParams: Promise<{
    company?: string;
    q?: string;
    page?: string;
  }>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const locale = await getLocale();
  const raw = await searchParams;
  const query = parseStartupJobsQuery(raw);
  const roles = await listPublicStartupRoles();
  const filtered = applyStartupJobsQuery(roles, query);
  const pagination = paginateStartupRoles(filtered, query.page);
  const canonical =
    query.company || query.q
      ? STARTUPS_JOBS_PATH
      : buildStartupJobsPath({ page: pagination.page });
  return {
    title: JOBS_H1,
    description: JOBS_META,
    robots: startupsPublicRobots(),
    ...buildOgMeta(JOBS_H1, JOBS_META, "Startups"),
    alternates: await localeAlternates(canonical),
    ...(pagination.totalPages > 1 && !query.company && !query.q
      ? {
          pagination: {
            ...(pagination.page > 1
              ? {
                  previous: absoluteLocaleUrl(
                    locale,
                    `${STARTUPS_JOBS_PATH}?page=${pagination.page - 1}`,
                  ),
                }
              : {}),
            ...(pagination.page < pagination.totalPages
              ? {
                  next: absoluteLocaleUrl(
                    locale,
                    `${STARTUPS_JOBS_PATH}?page=${pagination.page + 1}`,
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
}

export default async function StartupsJobsRoute({ searchParams }: PageProps) {
  const locale = await getLocale();
  const t = await getTranslations("investigationsStartups");
  const session = await getSession();
  const query = parseStartupJobsQuery(await searchParams);
  const roles = await listPublicStartupRoles();

  return (
    <StartupsJobsPage
      locale={locale}
      t={t}
      roles={roles}
      query={query}
      promoteJoin={shouldPromoteJoin(toHubAuthUser(session?.user))}
    />
  );
}
