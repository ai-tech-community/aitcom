import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AwesomeAiOssPage } from "@/components/investigations/awesome-ai-oss-page";
import {
  AWESOME_AI_OSS_H1,
  AWESOME_AI_OSS_META,
  AWESOME_AI_OSS_PATH,
} from "@/lib/investigations/awesome-ai-oss";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: AWESOME_AI_OSS_H1,
    description: AWESOME_AI_OSS_META,
    ...buildOgMeta(AWESOME_AI_OSS_H1, AWESOME_AI_OSS_META, "Investigation"),
    alternates: await localeAlternates(AWESOME_AI_OSS_PATH),
  };
}

export default async function AwesomeAiOssInvestigationPage() {
  const locale = await getLocale();
  const t = await getTranslations("investigationsAwesomeAiOss");
  return <AwesomeAiOssPage locale={locale} t={t} />;
}
