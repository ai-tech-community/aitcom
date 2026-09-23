import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { StartupsPage } from "@/components/investigations/startups-page";
import {
  STARTUPS_INSIGHTS_H1,
  STARTUPS_INSIGHTS_META,
  STARTUPS_INSIGHTS_PATH,
  startupsPublicRobots,
  type StartupLocale,
} from "@/lib/investigations/startups";
import { buildStartupInsights } from "@/lib/investigations/startups-insights";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { userIsHubOperator } from "@/server/awesome-ai-oss/operator";
import {
  shouldPromoteJoin,
  toHubAuthUser,
} from "@/server/better-auth/hub-session";
import { getSession } from "@/server/better-auth/server";
import { listApprovedPublicStartups } from "@/server/startups/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const companies = await listApprovedPublicStartups();
  return {
    title: STARTUPS_INSIGHTS_H1,
    description: STARTUPS_INSIGHTS_META,
    robots: startupsPublicRobots(companies.length),
    ...buildOgMeta(
      STARTUPS_INSIGHTS_H1,
      STARTUPS_INSIGHTS_META,
      "Investigation",
    ),
    alternates: await localeAlternates(STARTUPS_INSIGHTS_PATH),
  };
}

export default async function StartupsInsightsPage() {
  const locale = await getLocale();
  const t = await getTranslations("investigationsStartups");
  const session = await getSession();
  const companies = await listApprovedPublicStartups();
  const copyLocale: StartupLocale = locale === "nl" ? "nl" : "en";
  const insights = buildStartupInsights(companies, copyLocale);
  const isModerator = session?.user
    ? await userIsHubOperator(session.user.id)
    : false;

  return (
    <StartupsPage
      locale={locale}
      t={t}
      companies={companies}
      isModerator={isModerator}
      tab="insights"
      insights={insights}
      promoteJoin={shouldPromoteJoin(toHubAuthUser(session?.user))}
    />
  );
}
