import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { StartupsPage } from "@/components/investigations/startups-page";
import {
  STARTUPS_INSIGHTS_H1,
  STARTUPS_INSIGHTS_META,
  STARTUPS_INSIGHTS_PATH,
  startupsInsightsShareUrl,
  startupsPublicRobots,
  type StartupLocale,
} from "@/lib/investigations/startups";
import {
  buildStartupInsights,
  startupInsightsOgSpec,
  startupInsightsShareFacts,
} from "@/lib/investigations/startups-insights";
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
  const locale = await getLocale();
  const copyLocale: StartupLocale = locale === "nl" ? "nl" : "en";
  const t = await getTranslations("investigationsStartups");
  const companies = await listApprovedPublicStartups();
  const insights = buildStartupInsights(companies, copyLocale);
  const facts = startupInsightsShareFacts(insights, copyLocale);
  const ogSpec = startupInsightsOgSpec(facts);
  const title = ogSpec
    ? t(ogSpec.titleKey, ogSpec.titleValues)
    : STARTUPS_INSIGHTS_H1;
  const description = ogSpec
    ? t(ogSpec.descriptionKey, ogSpec.descriptionValues)
    : STARTUPS_INSIGHTS_META;
  const shareUrl = startupsInsightsShareUrl(copyLocale);
  const og = buildOgMeta(title, description, t("shareOgKicker"));
  return {
    title,
    description,
    robots: startupsPublicRobots(companies.length),
    openGraph: { ...og.openGraph, url: shareUrl },
    twitter: og.twitter,
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
      shareUrl={startupsInsightsShareUrl(copyLocale)}
    />
  );
}
