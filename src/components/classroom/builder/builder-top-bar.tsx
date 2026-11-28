"use client";

import type { Ref } from "react";
import { cn } from "@/lib/utils";
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
import type { AutosaveStatus } from "@/components/use-autosave";

type CourseStatus = "draft" | "published" | "archived";

export type BuilderTopBarProps = {
  redesigned?: boolean;
  outlineButtonRef?: Ref<HTMLButtonElement>;
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
  redesigned = false,
  outlineButtonRef,
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
  const learning = useTranslations("redesign.classroom");

  return (
    <header className="bg-background border-border sticky top-(--shell-top-offset) z-40 border-b">
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6",
          redesigned && "max-sm:flex-col max-sm:items-stretch sm:py-3.5",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3",
            redesigned && "max-sm:gap-2",
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            ref={outlineButtonRef}
            onClick={onOpenOutline}
            aria-label={t("outline")}
          >
            <ListTree />
          </Button>
          <Link
            href={`/communities/${slug}/classroom` as never}
            aria-label={redesigned ? learning("courses") : undefined}
            className={cn(
              "text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-sm",
              redesigned &&
                "focus-visible:ring-ring min-h-11 min-w-11 justify-center rounded-md outline-none focus-visible:ring-2 sm:justify-start",
            )}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {redesigned ? (
              <span className="hidden sm:inline">{learning("courses")}</span>
            ) : (
              t("backToClassroom")
            )}
          </Link>
          <span
            className={cn("text-border", redesigned && "hidden sm:inline")}
            aria-hidden="true"
          >
            /
          </span>
          {redesigned ? (
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs">
                {learning("courseBuilder")}
              </p>
              <CourseTitleEditor title={title} onRename={onRenameTitle} />
            </div>
          ) : (
            <CourseTitleEditor title={title} onRename={onRenameTitle} />
          )}
          {redesigned && status === "published" ? null : (
            <StatusBadge status={status} />
          )}
          {redesigned ? null : (
            <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
              {isPublic ? t("visibilityPublic") : t("visibilityMembers")}
            </span>
          )}
        </div>

        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center gap-3",
            redesigned && "border-border max-sm:border-t max-sm:pt-2",
          )}
        >
          <SaveStatusText
            status={saveStatus}
            savedAt={savedAt}
            onRetry={onRetry}
          />
          <SegmentedControl
            size="sm"
            className={redesigned ? "max-lg:h-12" : undefined}
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
