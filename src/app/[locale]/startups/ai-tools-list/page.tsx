import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { AiToolsListHub } from "@/components/investigations/ai-tools-list-hub";
import {
  AI_TOOLS_LIST_PATH,
  aiToolsListCopy,
} from "@/lib/investigations/ai-tools-list";
import { buildOgMeta, localeAlternates } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const copy = aiToolsListCopy(await getLocale());
  return {
    title: copy.title,
    description: copy.description,
    robots: { index: true, follow: true },
    ...buildOgMeta(copy.title, copy.description, "Startups"),
    alternates: await localeAlternates(AI_TOOLS_LIST_PATH),
  };
}

export default async function AiToolsListPage() {
  const locale = await getLocale();
  return <AiToolsListHub locale={locale} />;
}
