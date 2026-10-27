"use client";

import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import type { AutosaveStatus } from "@/components/use-autosave";
import { Link } from "@/i18n/navigation";
import { communityMagazinePath } from "@/lib/magazines/paths";
import {
  canIssue,
  type IssueStatus,
  type ScheduleOrigin,
} from "@/lib/magazines/values";

import { useScheduleTime } from "../use-schedule-time";

export type BuilderTopBarProps = {
  communitySlug: string;
  magazineName: string;
  issueNumber: number;
  status: IssueStatus;
  scheduledFor: string | null;
  scheduledVia: ScheduleOrigin | null;
  /** The title as typed; an untitled issue says so. */
  title: string;
  saveStatus: AutosaveStatus;
  /** Why the last save failed, in friendly words, when no item row shows it. */
  saveError: string | null;
  /** A successful save that changed how the issue will be published. */
  saveAnnouncement?: string | null;
  onRetry: () => void;
  /** Conflict recovery: load the issue again from the server. */
  onReload: () => void;
  onPublish: () => void;
  /** Publish waits (e.g. for the public opt-in or after a conflict). */
  publishDisabled: boolean;
};

/**
 * The issue builder's one row of chrome: back to the Magazine tab ("Back to
 * <magazine>"), where you are (`/ magazine · Issue n · Draft`), whether your
 * work is safe, and the single Publish action (the screen's only orange). A conflict shows a
 * reload banner under it, never a silent overwrite.
 */
export function BuilderTopBar({
  communitySlug,
  magazineName,
  issueNumber,
  status,
  scheduledFor,
  scheduledVia,
  title,
  saveStatus,
  saveError,
  saveAnnouncement,
  onRetry,
  onReload,
  onPublish,
  publishDisabled,
}: BuilderTopBarProps) {
  const t = useTranslations("magazineEditor.builder");
  const displayTime = useScheduleTime();

  return (
    <header className="bg-background border-border sticky top-12 z-40 border-b">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-auto">
          <Link
            href={communityMagazinePath(communitySlug)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex shrink-0 items-center gap-1 rounded-sm text-sm outline-none focus-visible:ring-[3px]"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("backToMagazine", { magazine: magazineName })}
          </Link>
          <div className="flex min-w-0 flex-col">
            <SectionLabel as="p" bordered={false} className="truncate">
              {t("kicker", {
                magazine: magazineName,
                number: issueNumber,
                status: t(`status.${status}`),
              })}
            </SectionLabel>
            <h1 className="truncate text-base leading-tight font-semibold tracking-tight">
              {title.trim() || t("preview.untitled")}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SaveStatusText
            status={saveStatus}
            onRetry={onRetry}
            announcement={saveAnnouncement}
          />
          {scheduledFor && (
            <time
              dateTime={scheduledFor}
              className="text-muted-foreground text-xs"
            >
              {t.rich(
                scheduledVia === "auto" ? "goesOutAutomatically" : "goesOut",
                {
                  time: displayTime(scheduledFor),
                  timestamp: (chunks) => (
                    <span className="font-mono">{chunks}</span>
                  ),
                },
              )}
            </time>
          )}
          {!canIssue(status, "publish") ? (
            <Button type="button" variant="outline" size="sm" disabled>
              {t("published")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={onPublish}
              disabled={publishDisabled}
            >
              {t("publish.label")}
            </Button>
          )}
        </div>
      </div>

      {saveStatus === "error" && saveError ? (
        <p className="text-destructive border-border border-t px-4 py-2 text-sm sm:px-6">
          {saveError}
        </p>
      ) : null}

      {saveStatus === "conflict" ? (
        <div
          role="alert"
          className="border-border flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-2 text-sm sm:px-6"
        >
          <AlertTriangle
            className="text-destructive size-4 shrink-0"
            aria-hidden="true"
          />
          <p className="min-w-0 flex-1">{t("conflict")}</p>
          <Button type="button" variant="outline" size="sm" onClick={onReload}>
            {t("reload")}
          </Button>
        </div>
      ) : null}
    </header>
  );
}

function SaveStatusText({
  status,
  onRetry,
  announcement,
}: {
  status: AutosaveStatus;
  onRetry: () => void;
  announcement?: string | null;
}) {
  const t = useTranslations("magazineEditor.builder.save");

  let content: React.ReactNode = null;
  if (status === "saving") content = t("saving");
  else if (status === "dirty") content = t("unsaved");
  else if (status === "saved") content = t("saved");
  else if (status === "error") {
    content = (
      <span className="text-destructive inline-flex items-center gap-2">
        <AlertTriangle className="size-4" aria-hidden="true" />
        {t("failed")}
        <Button type="button" variant="outline" size="xs" onClick={onRetry}>
          {t("retry")}
        </Button>
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="text-muted-foreground flex min-h-5 flex-col text-xs leading-5"
    >
      {content}
      {announcement && <span>{announcement}</span>}
    </div>
  );
}
