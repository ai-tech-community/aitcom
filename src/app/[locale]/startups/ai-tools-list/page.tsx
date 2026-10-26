import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AiToolsListFallback } from "@/components/investigations/ai-tools-list-fallback";
import { StartupsProfilePage } from "@/components/investigations/startups-profile";
import {
  AI_TOOLS_LIST_PATH,
  AI_TOOLS_LIST_SLUG,
  aiToolsListCopy,
} from "@/lib/investigations/ai-tools-list";
import { buildOgMeta, localeAlternates } from "@/lib/metadata";
import {
  shouldPromoteJoin,
  toHubAuthUser,
} from "@/server/better-auth/hub-session";
import { getSession } from "@/server/better-auth/server";
import { listStartupNewsMentions } from "@/server/news/startup-links";
import {
  findApprovedPublicStartupBySlug,
  listOpenStartupRolesForCompany,
} from "@/server/startups/queries";

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
  const card = await findApprovedPublicStartupBySlug(AI_TOOLS_LIST_SLUG);
  if (!card) {
    return <AiToolsListFallback locale={locale} />;
  }

  const t = await getTranslations("investigationsStartups");
  const session = await getSession();
  const [roles, mentions] = await Promise.all([
    listOpenStartupRolesForCompany(card.id),
    listStartupNewsMentions(card.id).catch((err: unknown) => {
      console.error("ai tools list: could not list news", err);
      return [];
    }),
  ]);

  return (
    <StartupsProfilePage
      locale={locale}
      t={t}
      card={card}
      roles={roles}
      mentions={mentions}
      promoteJoin={shouldPromoteJoin(toHubAuthUser(session?.user))}
    />
  );
}
