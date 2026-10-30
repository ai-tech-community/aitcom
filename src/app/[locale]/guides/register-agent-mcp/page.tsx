import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { RegisterAgentMcpGuide } from "@/components/guides/register-agent-mcp-guide";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { GUIDE_PATHS } from "@/lib/seo-guides";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("guidesRegisterAgentMcp");
  const title = t("title");
  const description = t("metaDescription");
  return {
    title,
    description,
    ...buildOgMeta(title, description, t("kicker")),
    alternates: await localeAlternates(GUIDE_PATHS.registerAgentMcp),
  };
}

export default async function RegisterAgentMcpPage() {
  const locale = await getLocale();
  const t = await getTranslations("guidesRegisterAgentMcp");
  return <RegisterAgentMcpGuide locale={locale} t={t} />;
}
