"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowLeft, ChevronDown, ListTree } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RelativeTime } from "@/components/ui/relative-time";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CourseTitleEditor } from "./course-title-editor";
import type { AutosaveStatus } from "./use-autosave";

type CourseStatus = "draft" | "published" | "archived";

export type BuilderTopBarProps = {
  slug: string;
  courseSlug: string;
  title: string;
  /** Renames the course in place; absent when it cannot be changed (archived). */
  onRenameTitle?: (title: string) => void;
  status: CourseStatus;
  isPublic: boolean;
  saveStatus: AutosaveStatus;
  /** What the conflict banner says changed elsewhere. Default: the course. */
  conflictKey?: "errorChangedElsewhere" | "errorLessonChangedElsewhere";
  savedAt: Date | null;
  onRetry: () => void;
  /** Conflict recovery: reload the course from the server. */
  onReload: () => void;
  previewing: boolean;
  onTogglePreview: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  /** A publish/unpublish request is in flight. */
  statusChanging: boolean;
  /** Mobile only: opens the outline sheet. */
  onOpenOutline: () => void;
};

/**
 * The builder's one row of chrome: where you are, whether your work is safe,
 * edit/preview, and the single Publish action (the screen's only orange).
 */
export function BuilderTopBar({
  slug,
  title,
  onRenameTitle,
  status,
  isPublic,
  saveStatus,
  conflictKey = "errorChangedElsewhere",
  savedAt,
  onRetry,
  onReload,
  previewing,
  onTogglePreview,
  onPublish,
  onUnpublish,
  statusChanging,
  onOpenOutline,
}: BuilderTopBarProps) {
  const t = useTranslations("classroomBuilder");

  return (
    <header className="bg-background border-border sticky top-12 z-40 border-b">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={onOpenOutline}
            aria-label={t("outline")}
          >
            <ListTree />
          </Button>
          <Link
            href={`/communities/${slug}/classroom` as never}
            className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("backToClassroom")}
          </Link>
          <span className="text-border" aria-hidden="true">
            /
          </span>
          <CourseTitleEditor title={title} onRename={onRenameTitle} />
          <StatusBadge status={status} />
          <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
            {isPublic ? t("visibilityPublic") : t("visibilityMembers")}
          </span>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <SaveStatusText
            status={saveStatus}
            savedAt={savedAt}
            onRetry={onRetry}
          />
          <SegmentedControl
            size="sm"
            aria-label={t("editOrPreview")}
            value={previewing ? "preview" : "edit"}
            onValueChange={(v) => {
              if ((v === "preview") !== previewing) onTogglePreview();
            }}
            options={[
              { value: "edit", label: t("edit") },
              { value: "preview", label: t("preview") },
            ]}
          />
          {status === "draft" ? (
            <Button
              type="button"
              size="sm"
              onClick={onPublish}
              disabled={statusChanging}
            >
              {t("publish")}
            </Button>
          ) : status === "published" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={statusChanging}
                >
                  {t("statusPublished")}
                  <ChevronDown aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onUnpublish}>
                  {t("moveToDraft")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {saveStatus === "conflict" ? (
        <div
          role="alert"
          className="border-border flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-2 text-sm sm:px-6"
        >
          <AlertTriangle
            className="text-destructive size-4 shrink-0"
            aria-hidden="true"
          />
          <p className="min-w-0 flex-1">{t(conflictKey)}</p>
          <Button type="button" variant="outline" size="sm" onClick={onReload}>
            {t("reload")}
          </Button>
        </div>
      ) : null}
    </header>
  );
}

function StatusBadge({ status }: { status: CourseStatus }) {
  const t = useTranslations("classroomBuilder");
  if (status === "published") {
    return <Badge variant="secondary">{t("statusPublished")}</Badge>;
  }
  if (status === "archived") {
    return (
      <Badge variant="ghost" className="bg-muted text-muted-foreground">
        {t("statusArchived")}
      </Badge>
    );
  }
  return <Badge variant="outline">{t("statusDraft")}</Badge>;
}

function SaveStatusText({
  status,
  savedAt,
  onRetry,
}: {
  status: AutosaveStatus;
  savedAt: Date | null;
  onRetry: () => void;
}) {
  const t = useTranslations("classroomBuilder");

  let content: React.ReactNode = null;
  if (status === "saving") {
    content = t("saving");
  } else if (status === "dirty") {
    content = t("unsaved");
  } else if (status === "saved") {
    content = savedAt
      ? t.rich("savedAt", {
          time: () => <RelativeTime date={savedAt} />,
        })
      : t("saved");
  } else if (status === "error") {
    content = (
      <span className="text-destructive inline-flex items-center gap-2">
        <AlertTriangle className="size-4" aria-hidden="true" />
        {t("saveFailed")}
        <Button type="button" variant="outline" size="xs" onClick={onRetry}>
          {t("retry")}
        </Button>
      </span>
    );
  }

  return (
    <div
      aria-live="polite"
      className="text-muted-foreground min-h-5 text-xs leading-5"
    >
      {content}
    </div>
  );
}
