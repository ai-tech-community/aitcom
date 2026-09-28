"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionLabel } from "@/components/ui/section-label";
import { useAutosave } from "./use-autosave";
import { usePaneReport } from "./use-pane-report";
import type { CourseWriter } from "./course-writer";
import type { PaneSaveState } from "./course-builder";

const MIN_TITLE = 3;
const MAX_SUMMARY = 500;

type DetailsDraft = {
  title: string;
  summary: string;
  coverImageUrl: string | null;
};

export type CourseDetailsPaneProps = {
  course: {
    id: number;
    slug: string;
    title: string;
    summary: string | null;
    coverImageUrl: string | null;
    isPublic: boolean;
  };
  /** Shared with every other course write in the builder (see course-writer.ts). */
  writer: CourseWriter;
  readOnly: boolean;
  onStatusChange: (state: PaneSaveState) => void;
};

/**
 * The course's own fields — title, summary, cover — autosaved as one draft.
 * Visibility is shown but changed elsewhere (staff decide it on the course page).
 */
export function CourseDetailsPane({
  course,
  writer,
  readOnly,
  onStatusChange,
}: CourseDetailsPaneProps) {
  const t = useTranslations("classroomBuilder");
  const utils = api.useUtils();
  const update = api.classrooms.update.useMutation();

  const titleId = useId();
  const titleHintId = useId();
  const summaryId = useId();
  const summaryHintId = useId();
  const coverLabelId = useId();
  const coverHintId = useId();

  const [draft, setDraft] = useState<DetailsDraft>(() => ({
    title: course.title,
    summary: course.summary ?? "",
    coverImageUrl: course.coverImageUrl,
  }));
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const titleValid = draft.title.trim().length >= MIN_TITLE;
  const { mutateAsync } = update;
  const courseId = course.id;
  const courseSlug = course.slug;

  const save = useCallback(
    async (value: DetailsDraft) => {
      const fields = {
        title: value.title.trim(),
        summary: value.summary.trim(),
        coverImageUrl: value.coverImageUrl,
      };
      await writer.run(async (expectedUpdatedAt) => {
        const result = await mutateAsync({
          courseId,
          ...fields,
          expectedUpdatedAt,
        });
        return result.updatedAt;
      });
      // Keep the shared course query in step so the top bar and preview show
      // what was saved without a refetch.
      utils.classrooms.get.setData({ slug: courseSlug }, (old) =>
        old ? { ...old, course: { ...old.course, ...fields } } : old,
      );
    },
    [writer, mutateAsync, courseId, courseSlug, utils],
  );

  const autosave = useAutosave({
    value: draft,
    save,
    enabled: !readOnly && titleValid,
  });

  // Saving pauses while the title is too short; that draft is still unsaved work.
  usePaneReport({
    autosave,
    paused: !readOnly && !titleValid,
    onStatusChange,
  });

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
          {course.isPublic ? t("visibilityPublic") : t("visibilityMembers")}
        </dd>
        <dd className="text-muted-foreground text-sm">{t("visibilityHint")}</dd>
      </dl>
    </div>
  );
}
