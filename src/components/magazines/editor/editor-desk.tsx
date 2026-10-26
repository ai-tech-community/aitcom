"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useRouter } from "@/i18n/navigation";
import {
  issueBuilderPath,
  magazineArticleEditPath,
  magazineSettingsPath,
  magazineWritePath,
} from "@/lib/magazines/paths";
import type { IssueListRow } from "@/server/magazines/issue-editing";
import { api } from "@/trpc/react";

import { useIssueDateline } from "../reading/issue-dateline";
import { readEditorError } from "./editor-errors";

/** Review states of an article that is not ready yet, as the desk names them. */
const REVIEW_STATUSES = [
  "pending_review",
  "changes_requested",
  "rejected",
] as const;
type DraftReviewStatus = (typeof REVIEW_STATUSES)[number] | "draft";

function draftStatusOf(reviewStatus: string | null): DraftReviewStatus {
  return (REVIEW_STATUSES as readonly string[]).includes(reviewStatus ?? "")
    ? (reviewStatus as DraftReviewStatus)
    : "draft";
}

/** The number the next issue will most likely get, for its working title. */
function nextIssueNumber(issues: IssueListRow[]): number {
  return issues.reduce((max, issue) => Math.max(max, issue.number), 0) + 1;
}

type ListQuery = {
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
};

/** One desk list: its label, then rows, a skeleton, an error or a hint. */
function DeskList({
  label,
  query,
  empty,
  children,
}: {
  label: string;
  query: ListQuery;
  /** The teaching line when the list is empty; null when it has rows. */
  empty: string | null;
  children: ReactNode;
}) {
  const t = useTranslations("magazineEditor.desk");
  const labelId = useId();
  return (
    <section aria-labelledby={labelId} className="flex min-w-0 flex-col gap-3">
      <SectionLabel as="h3" id={labelId}>
        {label}
      </SectionLabel>
      {query.isLoading ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : query.isError ? (
        <ErrorState
          className="items-start px-0 py-4 text-left"
          title={t("loadFailed")}
          description=""
          retryLabel={t("tryAgain")}
          onRetry={() => void query.refetch()}
        />
      ) : empty !== null ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">{children}</ul>
      )}
    </section>
  );
}

function IssueRow({ issue, slug }: { issue: IssueListRow; slug: string }) {
  const t = useTranslations("magazineEditor.desk");
  const dateline = useIssueDateline({
    number: issue.number,
    publishedAt: issue.publishedAt ?? null,
  });
  return (
    <li>
      <Link
        href={issueBuilderPath(slug, issue.id)}
        className="hover:bg-secondary/50 flex min-w-0 flex-col gap-1 px-3 py-2.5 transition-colors"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground font-mono text-xs">
            {dateline}
          </span>
          <Badge
            variant={issue.status === "draft" ? "secondary" : "outline"}
            className="font-normal"
          >
            {t(`status.${issue.status}`)}
          </Badge>
        </span>
        <span className="text-sm font-medium break-words">{issue.title}</span>
      </Link>
    </li>
  );
}

/** Mono date of the last change to a row. */
function UpdatedAt({ value }: { value: string }) {
  const format = useFormatter();
  return (
    <time
      dateTime={value}
      className="text-muted-foreground shrink-0 font-mono text-xs"
    >
      {format.dateTime(new Date(value), { day: "numeric", month: "short" })}
    </time>
  );
}

/**
 * The editor desk on the community Magazine tab (editors only): start a new
 * issue (it opens in the issue builder), write an article, open the
 * settings; then the magazine's issues with their status, the articles
 * ready for an issue, and the editor's own drafts. "New issue" is not
 * orange: the tab's one orange action is "Read the issue".
 */
export function EditorDesk({ slug }: { slug: string }) {
  const t = useTranslations("magazineEditor.desk");
  const tErrors = useTranslations("magazineEditor.errors");
  const router = useRouter();
  const labelId = useId();
  const [createError, setCreateError] = useState<string | null>(null);

  const issues = api.magazines.listIssues.useQuery({ slug });
  const ready = api.magazines.availableArticles.useQuery({ slug });
  const drafts = api.magazines.myDraftArticles.useQuery({ slug });

  const createIssue = api.magazines.createIssue.useMutation({
    onSuccess: ({ id }) => router.push(issueBuilderPath(slug, id)),
    onError: (error) => setCreateError(tErrors(readEditorError(error).key)),
  });

  const startIssue = () => {
    if (!issues.data) return;
    setCreateError(null);
    createIssue.mutate({
      slug,
      title: t("newIssueTitle", { number: nextIssueNumber(issues.data) }),
    });
  };

  const issueRows = issues.data ?? [];
  const readyRows = ready.data ?? [];
  const draftRows = drafts.data ?? [];

  return (
    <section
      aria-labelledby={labelId}
      className="flex flex-col gap-6 rounded-xl border p-4 @xl:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={labelId} className="text-lg font-semibold tracking-tight">
          {t("label")}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ink"
            size="sm"
            onClick={startIssue}
            disabled={!issues.data || createIssue.isPending}
          >
            {t("newIssue")}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={magazineWritePath(slug)}>{t("write")}</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={magazineSettingsPath(slug)}>{t("settings")}</Link>
          </Button>
        </div>
      </div>
      {createError && (
        <p role="alert" className="text-destructive text-sm">
          {createError}
        </p>
      )}

      <div className="grid gap-8 @3xl:grid-cols-3">
        <DeskList
          label={t("issues")}
          query={issues}
          empty={issueRows.length === 0 ? t("issuesEmpty") : null}
        >
          {issueRows.map((issue) => (
            <IssueRow key={issue.id} issue={issue} slug={slug} />
          ))}
        </DeskList>

        <DeskList
          label={t("ready")}
          query={ready}
          empty={readyRows.length === 0 ? t("readyEmpty") : null}
        >
          {readyRows.map((article) => {
            const content = (
              <>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium break-words">
                    {article.title}
                  </span>
                  {article.authorName && (
                    <span className="text-muted-foreground text-xs">
                      {t("byAuthor", { name: article.authorName })}
                    </span>
                  )}
                </span>
                <UpdatedAt value={article.updatedAt} />
              </>
            );
            // The writer can still reopen a ready article to fix it; other
            // editors see it listed (the edit page only opens for its author).
            return (
              <li key={article.id}>
                {article.editableByViewer ? (
                  <Link
                    href={magazineArticleEditPath(slug, article.slug)}
                    className="hover:bg-secondary/50 flex items-start justify-between gap-3 px-3 py-2.5 transition-colors"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </DeskList>

        <DeskList
          label={t("drafts")}
          query={drafts}
          empty={draftRows.length === 0 ? t("draftsEmpty") : null}
        >
          {draftRows.map((article) => (
            <li key={article.id}>
              <Link
                href={magazineArticleEditPath(slug, article.slug)}
                className="hover:bg-secondary/50 flex items-start justify-between gap-3 px-3 py-2.5 transition-colors"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium break-words">
                    {article.title}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t(`reviewStatus.${draftStatusOf(article.reviewStatus)}`)}
                  </span>
                </span>
                <UpdatedAt value={article.updatedAt} />
              </Link>
            </li>
          ))}
        </DeskList>
      </div>
    </section>
  );
}
