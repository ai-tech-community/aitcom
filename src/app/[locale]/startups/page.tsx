import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { StartupsPage } from "@/components/investigations/startups-page";
import {
  STARTUPS_H1,
  STARTUPS_INSIGHTS_PATH,
  STARTUPS_META,
  STARTUPS_PATH,
  applyStartupDirectoryQuery,
  buildStartupDirectoryPath,
  paginateStartupCards,
  parseStartupDirectoryQuery,
  startupDirectoryCanonicalPath,
  startupDirectoryHasFilters,
  startupsPublicRobots,
  type StartupLocale,
} from "@/lib/investigations/startups";
import { isStartupInsightsTab } from "@/lib/investigations/startups-insights";
import { redirect } from "@/i18n/navigation";
import {
  absoluteLocaleUrl,
  localeAlternates,
  buildOgMeta,
} from "@/lib/metadata";
import { userIsHubOperator } from "@/server/awesome-ai-oss/operator";
import {
  shouldPromoteJoin,
  toHubAuthUser,
} from "@/server/better-auth/hub-session";
import { getSession } from "@/server/better-auth/server";
import { listApprovedPublicStartups } from "@/server/startups/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    region?: string;
    stage?: string;
    status?: string;
    exit?: string;
    hiring?: string;
    sort?: string;
    page?: string;
    tab?: string;
  }>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const locale = await getLocale();
  const raw = await searchParams;
  const companies = await listApprovedPublicStartups();
  const robots = startupsPublicRobots(companies.length);
  if (isStartupInsightsTab(raw.tab)) {
    return {
      title: STARTUPS_H1,
      robots,
      alternates: await localeAlternates(STARTUPS_INSIGHTS_PATH),
    };
  }
  const query = parseStartupDirectoryQuery(raw);
  const filtered = applyStartupDirectoryQuery(
    companies,
    query,
    (locale === "nl" ? "nl" : "en") as StartupLocale,
  );
  const pagination = paginateStartupCards(filtered, query.page);
  const canonicalPath = startupDirectoryCanonicalPath({
    ...query,
    page: pagination.page,
  });

  const paginationLinks =
    !startupDirectoryHasFilters(query) && pagination.totalPages > 1
      ? {
          pagination: {
            ...(pagination.page > 1
              ? {
                  previous: absoluteLocaleUrl(
                    locale,
                    buildStartupDirectoryPath({
                      ...query,
                      page: pagination.page - 1,
                    }),
                  ),
                }
              : {}),
            ...(pagination.page < pagination.totalPages
              ? {
                  next: absoluteLocaleUrl(
                    locale,
                    buildStartupDirectoryPath({
                      ...query,
                      page: pagination.page + 1,
                    }),
                  ),
                }
              : {}),
          },
        }
      : {};

  return {
    title: STARTUPS_H1,
    description: STARTUPS_META,
    robots,
    ...buildOgMeta(STARTUPS_H1, STARTUPS_META, "Investigation"),
    alternates: await localeAlternates(
      canonicalPath.startsWith(STARTUPS_PATH) ? canonicalPath : STARTUPS_PATH,
    ),
    ...paginationLinks,
  };
}

export default async function StartupsInvestigationPage({
  searchParams,
}: PageProps) {
  const locale = await getLocale();
  const raw = await searchParams;
  if (isStartupInsightsTab(raw.tab)) {
    redirect({ href: STARTUPS_INSIGHTS_PATH, locale });
  }

  const t = await getTranslations("investigationsStartups");
  const session = await getSession();
  const query = parseStartupDirectoryQuery(raw);
  const companies = await listApprovedPublicStartups();
  const isModerator = session?.user
    ? await userIsHubOperator(session.user.id)
    : false;

  return (
    <StartupsPage
      locale={locale}
      t={t}
      companies={companies}
      isModerator={isModerator}
      query={query}
      promoteJoin={shouldPromoteJoin(toHubAuthUser(session?.user))}
    />
  );
}
