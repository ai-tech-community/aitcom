import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AwesomeAiOssPage } from "@/components/investigations/awesome-ai-oss-page";
import {
  AWESOME_AI_OSS_INSIGHTS_H1,
  AWESOME_AI_OSS_INSIGHTS_META,
  AWESOME_AI_OSS_INSIGHTS_PATH,
  AWESOME_AI_OSS_PATH,
  type AwesomeLocale,
} from "@/lib/investigations/awesome-ai-oss";
import { buildAwesomeInsights } from "@/lib/investigations/awesome-ai-oss-insights";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { listApprovedPublicCards } from "@/server/awesome-ai-oss/queries";
import { userIsHubOperator } from "@/server/awesome-ai-oss/operator";
import {
  shouldPromoteJoin,
  toHubAuthUser,
} from "@/server/better-auth/hub-session";
import { getSession } from "@/server/better-auth/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: AWESOME_AI_OSS_INSIGHTS_H1,
    description: AWESOME_AI_OSS_INSIGHTS_META,
    robots: { index: true, follow: true },
    ...buildOgMeta(
      AWESOME_AI_OSS_INSIGHTS_H1,
      AWESOME_AI_OSS_INSIGHTS_META,
      "Investigation",
    ),
    alternates: await localeAlternates(AWESOME_AI_OSS_INSIGHTS_PATH),
  };
}

export default async function AwesomeAiOssInsightsPage() {
  const locale = await getLocale();
  const t = await getTranslations("investigationsAwesomeAiOss");
  const session = await getSession();
  const signedIn = Boolean(session?.user);
  const projects = await listApprovedPublicCards();
  const copyLocale: AwesomeLocale = locale === "nl" ? "nl" : "en";
  const insights = buildAwesomeInsights(projects, copyLocale);
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
      signInHref={signInHref}
      tab="insights"
      insights={insights}
      promoteJoin={shouldPromoteJoin(toHubAuthUser(session?.user))}
    />
  );
}
