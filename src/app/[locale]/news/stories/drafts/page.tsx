import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { StorylineDraftsAwaiting } from "@/components/news/storyline-drafts-awaiting";
import { Link } from "@/i18n/navigation";
import { STORYLINE_DRAFT_QUEUE_PATH } from "@/lib/news/storyline-draft-review";
import { getSession } from "@/server/better-auth/server";

export const metadata: Metadata = {
  title: "Drafts awaiting approval",
  robots: { index: false, follow: false },
};

export default async function StorylineDraftQueuePage() {
  const locale = await getLocale();
  const session = await getSession();
  if (!session?.user) {
    redirect(
      `/${locale}/auth/signin?redirect=/${locale}${STORYLINE_DRAFT_QUEUE_PATH}`,
    );
  }
  const t = await getTranslations("newsStories");
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:px-12">
      <Link
        href="/news/stories/manage"
        className="text-muted-foreground text-sm underline underline-offset-4"
      >
        {t("draftReview.openEditor")}
      </Link>
      <h1 className="mt-8 text-3xl font-semibold">
        {t("draftReview.section")}
      </h1>
      <div className="mt-8">
        <StorylineDraftsAwaiting heading={false} />
      </div>
    </main>
  );
}
