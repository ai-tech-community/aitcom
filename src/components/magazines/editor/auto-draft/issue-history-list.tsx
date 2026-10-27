"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type {
  IssueHistoryDetail,
  ScheduleFailure,
} from "@/lib/magazines/issue-history";
import { issueBuilderPath } from "@/lib/magazines/paths";
import { api } from "@/trpc/react";

import { useScheduleTime } from "../use-schedule-time";

function useHistoryText() {
  const t = useTranslations("magazineEditor.autoDraft.history");
  const displayTime = useScheduleTime();
  const failureText = (failure: ScheduleFailure): string => {
    switch (failure) {
      case "auto_off":
        return t("failures.auto_off");
      case "no_rights":
        return t("failures.no_rights");
      case "empty":
        return t("failures.empty");
      case "invalid_item":
        return t("failures.invalid_item");
      case "error":
        return t("failures.error");
      default: {
        const exhaustive: never = failure;
        return exhaustive;
      }
    }
  };
  const skipText = (
    detail: Extract<IssueHistoryDetail, { event: "draft_skipped" }>,
  ): string => {
    const reason = detail.reason;
    switch (reason) {
      case "too_few":
        return t("skipReasons.too_few", {
          found: detail.found ?? 0,
          needed: detail.needed ?? 0,
        });
      case "draft_open":
        return t("skipReasons.draft_open");
      case "no_rights":
        return t("skipReasons.no_rights");
      default: {
        const exhaustive: never = reason;
        return exhaustive;
      }
    }
  };
  return (detail: IssueHistoryDetail): string => {
    switch (detail.event) {
      case "draft_made":
        return detail.goesOutAt
          ? t("draftMadeScheduled", { date: displayTime(detail.goesOutAt) })
          : t("draftMade");
      case "draft_skipped":
        return t("draftSkipped", { reason: skipText(detail) });
      case "items_changed":
        return t("itemsChanged");
      case "auto_publish_stopped":
        switch (detail.why) {
          case "edited":
            return t("stoppedByEditing");
          case "stopped":
            return t("stopped");
          case "failed":
            return t("failed", {
              failure: failureText(detail.failure ?? "error"),
            });
          default: {
            const exhaustive: never = detail.why;
            return exhaustive;
          }
        }
      case "published": {
        const origin = detail.origin;
        switch (origin) {
          case "button":
            return t("published.button");
          case "schedule":
            return t("published.schedule");
          case "auto":
            return t("published.auto");
          default: {
            const exhaustive: never = origin;
            return exhaustive;
          }
        }
      }
      case "deleted":
        return t("deleted");
      default: {
        const exhaustive: never = detail;
        return exhaustive;
      }
    }
  };
}

export function IssueHistoryList({ slug }: { slug: string }) {
  const t = useTranslations("magazineEditor.autoDraft");
  const id = useId();
  const displayTime = useScheduleTime();
  const historyText = useHistoryText();
  const query = api.magazines.autoDraftHistory.useQuery({ slug });
  let content;
  if (query.isLoading)
    content = (
      <div aria-hidden="true" className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  else if (query.isError || !query.data)
    content = (
      <ErrorState
        title={t("historyLoadFailed")}
        retryLabel={t("tryAgain")}
        onRetry={() => void query.refetch()}
      />
    );
  else if (query.data.length === 0)
    content = (
      <p className="text-muted-foreground max-w-prose text-sm">
        {t("history.empty")}
      </p>
    );
  else
    content = (
      <ol className="divide-y border-y">
        {query.data.map((entry) => {
          const issue = entry.issue;
          const issueText = issue
            ? t("history.issue", {
                number: issue.number ?? "",
                title: issue.title ?? "",
              })
            : null;
          const linkIssue =
            issue?.id != null &&
            (issue.status === "draft" || issue.status === "scheduled");
          return (
            <li key={entry.id} className="space-y-2 py-4 text-sm break-words">
              <p>
                {entry.actorName ?? t("history.automatic")}{" "}
                {historyText(entry.detail)}
              </p>
              {issueText &&
                (linkIssue ? (
                  <Link
                    href={issueBuilderPath(slug, issue.id!)}
                    className="block w-fit font-medium underline underline-offset-4"
                  >
                    {issueText}
                  </Link>
                ) : (
                  <p className="font-medium">{issueText}</p>
                ))}
              <time
                dateTime={entry.createdAt}
                className="text-muted-foreground block font-mono text-xs"
              >
                {displayTime(entry.createdAt)}
              </time>
            </li>
          );
        })}
      </ol>
    );
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-4">
      <SectionLabel as="h2" id={id}>
        {t("history.title")}
      </SectionLabel>
      {content}
    </section>
  );
}
