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
  rolesListedSince,
  startupJobsFollowFromQuery,
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
import {
  findStartupJobsFollow,
  markStartupJobsFollowSeen,
} from "@/server/startups/member-jobs";

export const dynamic = "force-dynamic";

const JOBS_H1 = "Open positions";
const JOBS_META =
  "Sourced openings from verified careers pages of listed AI startups. Original posting always linked. Not a size or salary scorecard.";

interface PageProps {
  searchParams: Promise<{
    company?: string;
    q?: string;
    location?: string;
    workType?: string;
    sort?: string;
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
  const filteredView = Boolean(
    query.company ||
    query.q ||
    query.location ||
    query.workType ||
    query.sort !== "role",
  );
  const canonical = filteredView
    ? STARTUPS_JOBS_PATH
    : buildStartupJobsPath({ page: pagination.page });
  return {
    title: JOBS_H1,
    description: JOBS_META,
    robots: startupsPublicRobots(),
    ...buildOgMeta(JOBS_H1, JOBS_META, "Startups"),
    alternates: await localeAlternates(canonical),
    ...(pagination.totalPages > 1 && !filteredView
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

export default async function JobsRoute({ searchParams }: PageProps) {
  const locale = await getLocale();
  const t = await getTranslations("investigationsStartups");
  const session = await getSession();
  const promoteJoin = shouldPromoteJoin(toHubAuthUser(session?.user));
  const query = parseStartupJobsQuery(await searchParams);
  const roles = await listPublicStartupRoles();
  const follow = promoteJoin ? null : startupJobsFollowFromQuery(query);
  const saved =
    session?.user?.id && follow
      ? await findStartupJobsFollow(session.user.id, follow)
      : null;
  const newRoles = saved
    ? rolesListedSince(roles, query, saved.lastSeenAt.toISOString()).map(
        (role) => ({
          slug: role.slug,
          title: role.title,
          startupName: role.startupName,
        }),
      )
    : [];
  if (session?.user?.id && follow && saved) {
    await markStartupJobsFollowSeen(session.user.id, follow);
  }

  return (
    <StartupsJobsPage
      locale={locale}
      t={t}
      roles={roles}
      query={query}
      promoteJoin={promoteJoin}
      follow={follow}
      following={Boolean(saved)}
      newRoles={newRoles}
    />
  );
}
