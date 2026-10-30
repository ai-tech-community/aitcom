"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import {
  issueBuilderPath,
  issueStatsPath,
  magazineAutoDraftPath,
  magazineArticleEditPath,
  magazineReviewPath,
  magazineSettingsPath,
  magazineTeamPath,
  magazineWritePath,
} from "@/lib/magazines/paths";
import { writerStatusOf } from "@/lib/magazines/review";
import { canIssue, type IssueStatus } from "@/lib/magazines/values";
import type { IssueListRow } from "@/server/magazines/issue-editing";
import { api } from "@/trpc/react";

import { useIssueDateline } from "../reading/issue-dateline";
import { ConfirmDeleteButton } from "./confirm-delete-button";
import { DeskList, UpdatedAt } from "./desk-list";
import { readEditorError } from "./editor-errors";
import { SubscriberCountLine } from "./subscriber-count-line";
import { useScheduleTime } from "./use-schedule-time";

const STATUS_VARIANT: Record<IssueStatus, "secondary" | "outline"> = {
  draft: "secondary",
  scheduled: "secondary",
  published: "outline",
};

/** The number the next issue will most likely get, for its working title. */
function nextIssueNumber(issues: IssueListRow[]): number {
  return issues.reduce((max, issue) => Math.max(max, issue.number), 0) + 1;
}

function IssueRow({
  issue,
  slug,
  onDelete,
}: {
  issue: IssueListRow;
  slug: string;
  onDelete: ((issue: IssueListRow) => void) | null;
}) {
  const t = useTranslations("magazineEditor.desk");
  const tStats = useTranslations("magazineEditor.stats");
  const displayTime = useScheduleTime();
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
          <Badge variant={STATUS_VARIANT[issue.status]} className="font-normal">
            {t(`status.${issue.status}`)}
          </Badge>
        </span>
        <span className="text-sm font-medium break-words">{issue.title}</span>
        {issue.status === "scheduled" && issue.scheduledFor && (
          <time
            dateTime={issue.scheduledFor}
            className="text-muted-foreground text-xs"
          >
            {t.rich("goesOut", {
              time: displayTime(issue.scheduledFor),
              timestamp: (chunks) => (
                <span className="font-mono">{chunks}</span>
              ),
            })}
          </time>
        )}
      </Link>
      {onDelete && (
        <div className="px-3 pb-2">
          <ConfirmDeleteButton
            label={t("delete")}
            title={t("deleteIssueTitle", { title: issue.title })}
            description={t("deleteIssueBody")}
            confirmLabel={t("deleteConfirm")}
            cancelLabel={t("cancel")}
            onConfirm={() => onDelete(issue)}
          />
        </div>
      )}
      {issue.status === "published" && (
        <Button variant="ghost" size="sm" className="mb-2 ml-3" asChild>
          <Link href={issueStatsPath(slug, issue.id)}>
            {tStats.rich("linkFor", {
              number: issue.number,
              sr: (chunks) => <span className="sr-only">{chunks}</span>,
            })}
          </Link>
        </Button>
      )}
    </li>
  );
}

/**
 * The editor desk on the community Magazine tab (editors only): start a new
 * issue (it opens in the issue builder), write an article, open the
 * settings (with manage); then articles waiting for review, the magazine's
 * issues, articles ready for an issue, and the editor's own drafts.
 * Desk actions use ink, outline or ghost to preserve the tab's accent.
 */
export function EditorDesk({
  slug,
  canManage,
}: {
  slug: string;
  canManage: boolean;
}) {
  const t = useTranslations("magazineEditor.desk");
  const tAutoDraft = useTranslations("magazineEditor.autoDraft");
  const format = useFormatter();
  const tErrors = useTranslations("magazineEditor.errors");
  const router = useRouter();
  const labelId = useId();
  const [createError, setCreateError] = useState<string | null>(null);

  const waiting = api.magazines.reviewQueue.useQuery({ slug });
  const issues = api.magazines.listIssues.useQuery({ slug });
  const ready = api.magazines.availableArticles.useQuery({ slug });
  const drafts = api.magazines.myDraftArticles.useQuery({ slug });

  const utils = api.useUtils();
  const deleteIssue = api.magazines.deleteDraftIssue.useMutation({
    onSuccess: () => {
      void utils.magazines.listIssues.invalidate({ slug });
    },
    onError: (error) => setCreateError(tErrors(readEditorError(error).key)),
  });
  const deleteArticle = api.articles.delete.useMutation({
    onSuccess: () => {
      void utils.magazines.availableArticles.invalidate({ slug });
      void utils.magazines.myDraftArticles.invalidate({ slug });
      void utils.magazines.pickerCandidates.invalidate({ slug });
    },
    onError: (error) => setCreateError(tErrors(readEditorError(error).key)),
  });
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

  const waitingRows = waiting.data ?? [];
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
            <Link href={magazineAutoDraftPath(slug)}>
              {tAutoDraft("title")}
            </Link>
          </Button>
          {canManage && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href={magazineTeamPath(slug)}>{t("team")}</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href={magazineSettingsPath(slug)}>{t("settings")}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
      <SubscriberCountLine slug={slug} />
      {createError && (
        <p role="alert" className="text-destructive text-sm">
          {createError}
        </p>
      )}

      <div className="grid gap-8 @3xl:grid-cols-2">
        <DeskList
          label={t("waiting")}
          query={waiting}
          empty={waitingRows.length === 0 ? t("waitingEmpty") : null}
        >
          {waitingRows.map((article) => (
            <li key={article.id}>
              <Link
                href={magazineReviewPath(slug, article.slug)}
                className="hover:bg-secondary/50 flex min-w-0 flex-col gap-1 px-3 py-2.5 transition-colors"
              >
                <span className="text-sm font-medium break-words">
                  {article.title}
                </span>
                {article.authorName && (
                  <span className="text-muted-foreground text-xs">
                    {t("byAuthor", { name: article.authorName })}
                  </span>
                )}
                <time
                  dateTime={article.sentAt}
                  className="text-muted-foreground font-mono text-xs"
                >
                  {t("sentOn", {
                    date: format.dateTime(new Date(article.sentAt), {
                      day: "numeric",
                      month: "short",
                    }),
                  })}
                </time>
              </Link>
            </li>
          ))}
        </DeskList>
        <DeskList
          label={t("issues")}
          query={issues}
          empty={issueRows.length === 0 ? t("issuesEmpty") : null}
        >
          {issueRows.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              slug={slug}
              onDelete={
                canIssue(issue.status, "delete")
                  ? (row) => deleteIssue.mutate({ slug, issueId: row.id })
                  : null
              }
            />
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
                <div className="px-3 pb-2">
                  <ConfirmDeleteButton
                    label={t("delete")}
                    title={t("deleteArticleTitle", { title: article.title })}
                    description={t("deleteArticleBody")}
                    confirmLabel={t("deleteConfirm")}
                    cancelLabel={t("cancel")}
                    pending={deleteArticle.isPending}
                    onConfirm={() => deleteArticle.mutate({ id: article.id })}
                  />
                </div>
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
                    {t(`reviewStatus.${writerStatusOf(article.reviewStatus)}`)}
                  </span>
                </span>
                <UpdatedAt value={article.updatedAt} />
              </Link>
              <div className="px-3 pb-2">
                <ConfirmDeleteButton
                  label={t("delete")}
                  title={t("deleteArticleTitle", { title: article.title })}
                  description={t("deleteArticleBody")}
                  confirmLabel={t("deleteConfirm")}
                  cancelLabel={t("cancel")}
                  pending={deleteArticle.isPending}
                  onConfirm={() => deleteArticle.mutate({ id: article.id })}
                />
              </div>
            </li>
          ))}
        </DeskList>
      </div>
    </section>
  );
}
