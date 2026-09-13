import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AwesomeAiOssPage } from "@/components/investigations/awesome-ai-oss-page";
import {
  AWESOME_AI_OSS_H1,
  AWESOME_AI_OSS_META,
  AWESOME_AI_OSS_PATH,
  applyAwesomeDirectoryQuery,
  parseAwesomeDirectoryQuery,
  type AwesomeLocale,
} from "@/lib/investigations/awesome-ai-oss";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { listApprovedPublicCards } from "@/server/awesome-ai-oss/queries";
import { userIsHubOperator } from "@/server/awesome-ai-oss/operator";
import { getSession } from "@/server/better-auth/server";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: AWESOME_AI_OSS_H1,
    description: AWESOME_AI_OSS_META,
    robots: { index: true, follow: true },
    ...buildOgMeta(AWESOME_AI_OSS_H1, AWESOME_AI_OSS_META, "Investigation"),
    alternates: await localeAlternates(AWESOME_AI_OSS_PATH),
  };
}

interface PageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    sort?: string;
  }>;
}

export default async function AwesomeAiOssInvestigationPage({
  searchParams,
}: PageProps) {
  const locale = await getLocale();
  const t = await getTranslations("investigationsAwesomeAiOss");
  const session = await getSession();
  const signedIn = Boolean(session?.user);
  const raw = await searchParams;
  const query = parseAwesomeDirectoryQuery(raw, signedIn);
  const projects = applyAwesomeDirectoryQuery(
    await listApprovedPublicCards(),
    { ...query, sort: "newest" },
    (locale === "nl" ? "nl" : "en") as AwesomeLocale,
  );
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
    />
  );
}
