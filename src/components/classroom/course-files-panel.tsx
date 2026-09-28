"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  MATERIAL_TITLE_MAX,
  fileTypeLabel,
  formatBytes,
  type MaterialVisibility,
} from "@/lib/classroom/material-rules";
import { api, type RouterOutputs } from "@/trpc/react";
import { FileTypeIcon } from "./materials/file-type-icon";

type CourseFile =
  RouterOutputs["classroomMaterials"]["listCourseMaterials"][number];

function CourseFileRow({
  file,
  busy,
  onRename,
  onVisibility,
  onDelete,
}: {
  file: CourseFile;
  busy: boolean;
  /** `revert` puts the saved name back into the field (the rename failed). */
  onRename: (title: string, revert: () => void) => void;
  onVisibility: (visibility: MaterialVisibility) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("classroom.files");
  const titleRef = useRef<HTMLInputElement>(null);
  const switchId = `course-file-preview-${file.id}`;
  const revert = () => {
    if (titleRef.current) titleRef.current.value = file.title;
  };
  return (
    <li className="border-border flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
      <FileTypeIcon
        extension={file.extension}
        className="text-muted-foreground size-5 shrink-0"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <Input
          ref={titleRef}
          defaultValue={file.title}
          aria-label={t("titleLabel")}
          maxLength={MATERIAL_TITLE_MAX}
          disabled={busy}
          className="h-8"
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next && next !== file.title) onRename(next, revert);
            else revert();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground font-mono text-xs">
            {`${fileTypeLabel(file.extension)} · ${formatBytes(file.bytes)}`}
          </span>
          {file.status === "uploading" ? (
            <span className="text-muted-foreground text-xs">
              {t("statusUploading")}
            </span>
          ) : null}
          {file.status === "failed" ? (
            <span className="text-destructive text-xs">
              {t("statusFailed")}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id={switchId}
          checked={file.visibility === "preview"}
          disabled={busy}
          onCheckedChange={(on) => onVisibility(on ? "preview" : "members")}
        />
        <Label htmlFor={switchId} className="text-sm font-normal">
          {t("previewToggle")}
        </Label>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={t("deleteFile")}
        title={t("deleteFile")}
        disabled={busy}
        onClick={onDelete}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </li>
  );
}

/**
 * The course's uploaded files (spec 2026-09-27 §4): rename, free preview or
 * members only, delete. Deleting frees the community's storage; lessons that
 * still use the file show that it was removed.
 *
 * Shown to an author who may upload, or who still has files to manage after
 * the community took upload rights away. The empty hint (which points at
 * uploading) is only for an author who can upload.
 */
export function CourseFilesPanel({
  courseId,
  canUpload,
}: {
  courseId: number;
  canUpload: boolean;
}) {
  const t = useTranslations("classroom.files");
  const utils = api.useUtils();
  const confirm = useConfirm();
  const list = api.classroomMaterials.listCourseMaterials.useQuery({
    courseId,
  });

  // The lesson editor reads file names and visibility from the course
  // manifest (`classrooms.get`), so both are refreshed after a change.
  const refresh = () => {
    void utils.classroomMaterials.listCourseMaterials.invalidate({ courseId });
    void utils.classrooms.get.invalidate();
  };
  const update = api.classroomMaterials.updateMaterial.useMutation({
    onSuccess: () => {
      toast.success(t("saved"));
      refresh();
    },
    onError: () => toast.error(t("saveFailed")),
  });
  const remove = api.classroomMaterials.deleteMaterial.useMutation({
    onSuccess: () => {
      toast.success(t("deleted"));
      refresh();
    },
    onError: () => toast.error(t("saveFailed")),
  });

  async function askToDelete(materialId: number) {
    const ok = await confirm({
      description: t("deleteConfirm"),
      confirmLabel: t("deleteFile"),
      destructive: true,
    });
    if (ok) remove.mutate({ materialId });
  }

  if (list.isLoading) {
    return canUpload ? <Skeleton className="h-24 rounded-lg" /> : null;
  }
  if (list.isError) {
    // Only the course's author may manage its files; anyone else sees nothing.
    if (list.error?.data?.code === "FORBIDDEN") return null;
    return <ErrorState onRetry={() => void list.refetch()} />;
  }
  const files = list.data ?? [];
  if (files.length === 0 && !canUpload) return null;
  const busy = update.isPending || remove.isPending;

  return (
    <section className="space-y-3" aria-labelledby="course-files-title">
      <div className="space-y-1">
        <h2 id="course-files-title" className="text-base font-semibold">
          {t("panelTitle")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("panelHelp")}</p>
        <p className="text-muted-foreground text-xs">{t("previewHelp")}</p>
      </div>
      {files.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("panelEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {files.map((file) => (
            <CourseFileRow
              key={file.id}
              file={file}
              busy={busy}
              onRename={(title, revert) =>
                update.mutate(
                  { materialId: file.id, title },
                  { onError: revert },
                )
              }
              onVisibility={(visibility) =>
                update.mutate({ materialId: file.id, visibility })
              }
              onDelete={() => void askToDelete(file.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
