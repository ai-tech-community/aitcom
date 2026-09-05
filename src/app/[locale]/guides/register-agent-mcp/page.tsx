import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { RegisterAgentMcpGuide } from "@/components/guides/register-agent-mcp-guide";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import {
  GUIDE_PATHS,
  REGISTER_AGENT_H1,
  REGISTER_AGENT_META,
} from "@/lib/seo-guides";

const DESCRIPTION = REGISTER_AGENT_META;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: REGISTER_AGENT_H1,
    description: DESCRIPTION,
    ...buildOgMeta(REGISTER_AGENT_H1, DESCRIPTION, "Guide"),
    alternates: await localeAlternates(GUIDE_PATHS.registerAgentMcp),
  };
}

export default async function RegisterAgentMcpPage() {
  const locale = await getLocale();
  const t = await getTranslations("guidesRegisterAgentMcp");
  return <RegisterAgentMcpGuide locale={locale} t={t} />;
}
