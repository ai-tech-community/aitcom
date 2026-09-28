"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionLabel } from "@/components/ui/section-label";
import { CourseFilesPanel } from "@/components/classroom/course-files-panel";
import type { CourseDetails } from "./use-course-details";

const MAX_SUMMARY = 500;

export type CourseDetailsPaneProps = {
  /** The course draft, owned by the builder (see use-course-details.ts). */
  details: CourseDetails;
  courseId: number;
  /** From `classrooms.get().viewerCanUpload`: the community lets this author upload files. */
  canUpload: boolean;
  isPublic: boolean;
  readOnly: boolean;
};

/**
 * The course's own fields — title, summary, cover. Edits go into the
 * builder's course draft, which autosaves. Visibility is shown but changed
 * elsewhere (staff decide it on the course page).
 *
 * Below them, the course's uploaded files. Files belong to the course, not
 * to one lesson (any lesson may use any of them), so they are managed here.
 * Each file change is its own immediate action, like deleting a lesson; it
 * is not part of the course draft. An archived course is read-only, so its
 * files are not offered for changes.
 */
export function CourseDetailsPane({
  details,
  courseId,
  canUpload,
  isPublic,
  readOnly,
}: CourseDetailsPaneProps) {
  const t = useTranslations("classroomBuilder");
  const { draft, setDraft, titleValid } = details;

  const titleId = useId();
  const titleHintId = useId();
  const summaryId = useId();
  const summaryHintId = useId();
  const coverLabelId = useId();
  const coverHintId = useId();

  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("alt", "course cover image");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");

      const json = (await res.json()) as { url: string };
      setDraft((d) => ({ ...d, coverImageUrl: json.url }));
    } catch {
      toast.error(t("uploadFailed"));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const showTitleHint = !readOnly && !titleValid;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-8 sm:px-6">
      <SectionLabel>{t("courseDetails")}</SectionLabel>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={titleId}>{t("titleLabel")}</Label>
        <Input
          id={titleId}
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          maxLength={200}
          disabled={readOnly}
          aria-invalid={showTitleHint || undefined}
          aria-describedby={showTitleHint ? titleHintId : undefined}
          className="text-base font-medium"
        />
        {showTitleHint ? (
          <p id={titleHintId} className="text-destructive text-sm">
            {t("titleTooShort")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={summaryId}>{t("summaryLabel")}</Label>
        <Textarea
          id={summaryId}
          value={draft.summary}
          onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
          rows={3}
          maxLength={MAX_SUMMARY}
          disabled={readOnly}
          aria-describedby={summaryHintId}
        />
        <p id={summaryHintId} className="text-muted-foreground text-sm">
          {t("summaryHint")}
        </p>
      </div>

      <div
        role="group"
        aria-labelledby={coverLabelId}
        aria-describedby={coverHintId}
        className="flex flex-col gap-1.5"
      >
        <span id={coverLabelId} className="text-sm leading-none font-medium">
          {t("coverLabel")}
        </span>
        <p id={coverHintId} className="text-muted-foreground text-sm">
          {t("coverHint")}
        </p>
        {draft.coverImageUrl ? (
          <div className="space-y-2">
            <div className="border-border overflow-hidden rounded-xl border">
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded URLs */}
              <img
                src={draft.coverImageUrl}
                alt=""
                className="aspect-[16/5] w-full object-cover"
              />
            </div>
            {readOnly ? null : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? (
                    <Loader2 className="animate-spin motion-reduce:animate-none" />
                  ) : (
                    <ImagePlus />
                  )}
                  {isUploading ? t("uploading") : t("replaceCover")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isUploading}
                  onClick={() =>
                    setDraft((d) => ({ ...d, coverImageUrl: null }))
                  }
                >
                  <Trash2 />
                  {t("removeCover")}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={readOnly || isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            ) : (
              <ImagePlus />
            )}
            {isUploading ? t("uploading") : t("addCover")}
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          disabled={readOnly}
          onChange={handleCoverUpload}
        />
      </div>

      <dl className="flex flex-col gap-1.5">
        <dt className="text-sm leading-none font-medium">
          {t("visibilityLabel")}
        </dt>
        <dd className="text-sm">
          {isPublic ? t("visibilityPublic") : t("visibilityMembers")}
        </dd>
        <dd className="text-muted-foreground text-sm">{t("visibilityHint")}</dd>
      </dl>

      {readOnly ? null : (
        <CourseFilesPanel courseId={courseId} canUpload={canUpload} />
      )}
    </div>
  );
}
