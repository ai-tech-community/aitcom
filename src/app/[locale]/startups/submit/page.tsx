import { resolveLocale } from "@/i18n/messages";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { StartupsSubmissionPage } from "@/components/investigations/startups-submission-page";
import {
  STARTUPS_PATH,
  STARTUPS_SUBMIT_PATH,
} from "@/lib/investigations/startups";
import { localeAlternates } from "@/lib/metadata";
import { userIsHubOperator } from "@/server/awesome-ai-oss/operator";
import { getSession } from "@/server/better-auth/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("investigationsStartups");
  return {
    title: t("submitTitle"),
    description: t("submitHelp"),
    robots: { index: false, follow: true },
    alternates: await localeAlternates(STARTUPS_SUBMIT_PATH),
  };
}

export default async function StartupSubmitPage() {
  const locale = await getLocale();
  const session = await getSession();
  const viewerId = session?.user.id ?? null;
  const isModerator = viewerId ? await userIsHubOperator(viewerId) : false;
  const signInHref = `/${locale}/auth/signin?redirect=${encodeURIComponent(`/${locale}${STARTUPS_SUBMIT_PATH}`)}`;

  return (
    <StartupsSubmissionPage
      mode="submit"
      locale={resolveLocale(locale)}
      card={null}
      isModerator={isModerator}
      signedIn={viewerId != null}
      signInHref={signInHref}
      closeHref={`/${locale}${STARTUPS_PATH}`}
    />
  );
}
