import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { AwesomeAiOssReviewQueue } from "@/components/investigations/awesome-ai-oss-review-queue";
import { Link } from "@/i18n/navigation";
import { SectionLabel } from "@/components/ui/section-label";
import {
  AWESOME_AI_OSS_PATH,
  AWESOME_AI_OSS_REVIEW_PATH,
  type AwesomeLocale,
} from "@/lib/investigations/awesome-ai-oss";
import { getSession } from "@/server/better-auth/server";
import { userIsHubOperator } from "@/server/awesome-ai-oss/operator";

export const metadata: Metadata = {
  title: "Awaiting review",
  robots: { index: false, follow: false },
};

export default async function AwesomeAiOssReviewPage() {
  const locale = await getLocale();
  const session = await getSession();
  if (!session?.user) {
    redirect(
      `/${locale}/auth/signin?redirect=/${locale}${AWESOME_AI_OSS_REVIEW_PATH}`,
    );
  }
  if (!(await userIsHubOperator(session.user.id))) {
    notFound();
  }

  const t = await getTranslations("investigationsAwesomeAiOss");

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:px-12">
      <nav className="text-muted-foreground text-xs">
        <Link
          href={AWESOME_AI_OSS_PATH}
          className="hover:text-foreground hover:underline"
        >
          ← {t("title")}
        </Link>
      </nav>
      <SectionLabel as="div" className="mt-8">
        {t("kicker")}
      </SectionLabel>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">
        {t("queueTitle")}
      </h1>
      <div className="mt-10">
        <AwesomeAiOssReviewQueue
          locale={(locale === "nl" ? "nl" : "en") as AwesomeLocale}
        />
      </div>
    </main>
  );
}
