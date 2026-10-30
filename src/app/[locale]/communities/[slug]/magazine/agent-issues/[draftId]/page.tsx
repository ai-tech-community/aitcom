import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AgentIssueReviewActions } from "@/components/magazines/editor/agent-issue-review-actions";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/messages";
import { communityMagazinePath } from "@/lib/magazines/paths";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { readAgentIssueReview } from "@/server/magazines/agent-magazine";
import { getPayloadClient } from "@/server/payload";

export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; slug: string; draftId: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "magazineEditor.agentIssueReview",
  });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function AgentIssueReviewPage({
  params,
}: {
  params: Params;
}) {
  const { locale, slug, draftId } = await params;
  const session = await getSession();
  if (!session?.user?.id) {
    redirect(
      `/${locale}/auth/signin?redirect=/${locale}${communityMagazinePath(slug)}/agent-issues/${draftId}`,
    );
  }
  const review = await readAgentIssueReview(
    { db, payload: await getPayloadClient() },
    session.user.id,
    draftId,
  );
  if (review?.communitySlug !== slug) notFound();
  const t = await getTranslations("magazineEditor.agentIssueReview");
  const statusKey =
    review.status === "published"
      ? "published"
      : review.status === "rejected"
        ? "rejected"
        : "pending";
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <SectionLabel>{t("kicker")}</SectionLabel>
      <div>
        <Link
          href={communityMagazinePath(slug)}
          className="text-muted-foreground text-sm underline underline-offset-4"
        >
          {t("back")}
        </Link>
        <h1 className="mt-6 text-3xl font-semibold">{review.title}</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          {t("proposedBy", { agent: review.agentName })}
        </p>
        <p className="text-muted-foreground mt-1 font-mono text-xs">
          {t("draftId", { id: review.draftId })}
        </p>
        <p className="mt-4 text-sm">{t(statusKey)}</p>
        <p className="text-muted-foreground mt-6 max-w-prose text-sm leading-relaxed">
          {review.isEditor ? t("editorNote") : t("ownerNote")}
        </p>
        <AgentIssueReviewActions
          draftId={review.draftId}
          canApprove={review.canApprove}
        />
      </div>
    </main>
  );
}
