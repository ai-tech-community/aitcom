import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AwesomeAiOssPage } from "@/components/investigations/awesome-ai-oss-page";
import {
  AWESOME_AI_OSS_H1,
  AWESOME_AI_OSS_INSIGHTS_PATH,
  AWESOME_AI_OSS_META,
  AWESOME_AI_OSS_PATH,
  applyAwesomeDirectoryQuery,
  awesomeDirectoryCanonicalPath,
  awesomeDirectoryHasFilters,
  buildAwesomeDirectoryPath,
  paginateAwesomeCards,
  parseAwesomeDirectoryQuery,
  type AwesomeLocale,
} from "@/lib/investigations/awesome-ai-oss";
import { isAwesomeInsightsTab } from "@/lib/investigations/awesome-ai-oss-insights";
import { redirect } from "@/i18n/navigation";
import {
  absoluteLocaleUrl,
  localeAlternates,
  buildOgMeta,
} from "@/lib/metadata";
import { listApprovedPublicCards } from "@/server/awesome-ai-oss/queries";
import { userIsHubOperator } from "@/server/awesome-ai-oss/operator";
import {
  shouldPromoteJoin,
  toHubAuthUser,
} from "@/server/better-auth/hub-session";
import { getSession } from "@/server/better-auth/server";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
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
  if (isAwesomeInsightsTab(raw.tab)) {
    return {
      title: AWESOME_AI_OSS_H1,
      robots: { index: true, follow: true },
      alternates: await localeAlternates(AWESOME_AI_OSS_INSIGHTS_PATH),
    };
  }
  const query = parseAwesomeDirectoryQuery(raw, false);
  const filtered = applyAwesomeDirectoryQuery(
    await listApprovedPublicCards(),
    query,
    (locale === "nl" ? "nl" : "en") as AwesomeLocale,
  );
  const pagination = paginateAwesomeCards(filtered, query.page);
  const canonicalPath = awesomeDirectoryCanonicalPath({
    ...query,
    page: pagination.page,
  });

  const paginationLinks =
    !awesomeDirectoryHasFilters(query) && pagination.totalPages > 1
      ? {
          pagination: {
            ...(pagination.page > 1
              ? {
                  previous: absoluteLocaleUrl(
                    locale,
                    buildAwesomeDirectoryPath({
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
                    buildAwesomeDirectoryPath({
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
    title: AWESOME_AI_OSS_H1,
    description: AWESOME_AI_OSS_META,
    robots: { index: true, follow: true },
    ...buildOgMeta(AWESOME_AI_OSS_H1, AWESOME_AI_OSS_META, "Investigation"),
    alternates: await localeAlternates(canonicalPath),
    ...paginationLinks,
  };
}

export default async function AwesomeAiOssInvestigationPage({
  searchParams,
}: PageProps) {
  const locale = await getLocale();
  const raw = await searchParams;
  if (isAwesomeInsightsTab(raw.tab)) {
    redirect({ href: AWESOME_AI_OSS_INSIGHTS_PATH, locale });
  }

  const t = await getTranslations("investigationsAwesomeAiOss");
  const session = await getSession();
  const signedIn = Boolean(session?.user);
  const query = parseAwesomeDirectoryQuery(raw, signedIn);
  const projects = await listApprovedPublicCards();
  const isModerator = session?.user
    ? await userIsHubOperator(session.user.id)
    : false;
  const signInHref = `/${locale}/auth/signin?redirect=/${locale}${AWESOME_AI_OSS_PATH}`;

  return (
    <AwesomeAiOssPage
      locale={locale}
      t={t}
      projects={projects}
      signedIn={signedIn}
      isModerator={isModerator}
      query={query}
      signInHref={signInHref}
      promoteJoin={shouldPromoteJoin(toHubAuthUser(session?.user))}
    />
  );
}
