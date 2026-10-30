"use client";

import { useTranslations } from "next-intl";

import { ArrowLink } from "@/components/dashboard/arrow-link";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";

/** Pending agent drafts the viewer may approve: stories, courses, threads, issues, and the rest. */
export function StorylineDraftsAwaiting({
  hideWhenEmpty = false,
  heading = true,
}: {
  hideWhenEmpty?: boolean;
  heading?: boolean;
}) {
  const t = useTranslations("newsStories.draftReview");
  const drafts = api.agentManagement.listApprovalQueue.useQuery();
  const label = heading ? (
    <SectionLabel id="drafts-awaiting-heading">{t("section")}</SectionLabel>
  ) : null;

  if (drafts.isPending) {
    if (hideWhenEmpty) return null;
    return (
      <section
        aria-labelledby={heading ? "drafts-awaiting-heading" : undefined}
        className="space-y-4"
      >
        {label}
        <Skeleton className="h-16 w-full" />
      </section>
    );
  }

  if (drafts.isError) {
    return (
      <section
        aria-labelledby={heading ? "drafts-awaiting-heading" : undefined}
        className="space-y-4"
      >
        {label}
        <ErrorState
          title={t("actionFailed")}
          onRetry={() => void drafts.refetch()}
        />
      </section>
    );
  }

  if (!drafts.data.length && hideWhenEmpty) return null;

  return (
    <section
      aria-labelledby={heading ? "drafts-awaiting-heading" : undefined}
      className="space-y-4"
    >
      {label}
      {drafts.data.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyHelp")} />
      ) : (
        <ul className="divide-y border-t">
          {drafts.data.map((draft) => (
            <li key={draft.id} className="py-4">
              <p className="text-muted-foreground font-mono text-xs tracking-wider">
                {draft.kind}
              </p>
              <p className="mt-1 text-sm font-medium">{draft.title}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t("proposedBy", { agent: draft.agentName })}
              </p>
              <p className="text-muted-foreground mt-1 font-mono text-xs">
                {t("draftId", { id: draft.id })}
              </p>
              <ArrowLink href={draft.reviewPath} className="mt-2">
                {t("review")}
              </ArrowLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
