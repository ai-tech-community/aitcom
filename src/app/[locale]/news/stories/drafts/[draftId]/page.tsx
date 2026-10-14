import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { StorylineDraftReviewActions } from "@/components/news/storyline-draft-review-actions";
import { Link } from "@/i18n/navigation";
import {
  storylineDraftReviewPath,
  storylineDraftViewerRole,
  STORYLINE_DRAFT_QUEUE_PATH,
} from "@/lib/news/storyline-draft-review";
import { getSession } from "@/server/better-auth/server";
import { isNewsStaff } from "@/server/news/staff";
import { readStorylineDraft } from "@/server/news/storyline-drafts";

export const metadata: Metadata = {
  title: "Review storyline draft",
  robots: { index: false, follow: false },
};

export default async function StorylineDraftReviewPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  const locale = await getLocale();
  const session = await getSession();
  if (!session?.user?.id) {
    redirect(
      `/${locale}/auth/signin?redirect=/${locale}${storylineDraftReviewPath(draftId)}`,
    );
  }
  const [draft, staff] = await Promise.all([
    readStorylineDraft(draftId),
    isNewsStaff(session.user.email),
  ]);
  const role = storylineDraftViewerRole({
    viewerId: session.user.id,
    ownerId: draft?.ownerId ?? "",
    staff,
  });
  if (!draft || (role !== "owner" && role !== "editor")) notFound();
  const t = await getTranslations("newsStories");
  const statusKey =
    draft.status === "approved"
      ? "statusApproved"
      : draft.status === "rejected"
        ? "statusRejected"
        : "statusPending";
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:px-12">
      <Link
        href={role === "editor" ? STORYLINE_DRAFT_QUEUE_PATH : "/dashboard"}
        className="text-muted-foreground text-sm underline underline-offset-4"
      >
        {t("draftReview.backToQueue")}
      </Link>
      <h1 className="mt-8 text-3xl font-semibold">{draft.title}</h1>
      <p className="text-muted-foreground mt-3 text-sm">
        {t("draftReview.proposedBy", { agent: draft.agentName })}
      </p>
      <p className="text-muted-foreground mt-1 font-mono text-xs">
        {t("draftReview.draftId", { id: draft.id })}
      </p>
      <p className="mt-4 text-sm">{t(`draftReview.${statusKey}`)}</p>
      {draft.overview ? (
        <p className="mt-6 max-w-prose text-sm leading-relaxed">
          {draft.overview}
        </p>
      ) : null}
      <p className="text-muted-foreground mt-6 max-w-prose text-sm leading-relaxed">
        {role === "editor"
          ? t("draftReview.editorNote")
          : t("draftReview.ownerNote")}
      </p>
      <StorylineDraftReviewActions
        draftId={draft.id}
        canApprove={role === "editor"}
        pending={draft.status === "pending"}
      />
      {role === "editor" ? (
        <p className="mt-6">
          <Link
            href="/news/stories/manage"
            className="text-sm font-medium underline underline-offset-4"
          >
            {t("draftReview.openEditor")}
          </Link>
        </p>
      ) : null}
    </main>
  );
}
