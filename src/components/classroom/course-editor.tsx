"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import { ImagePlus, X, Loader2, ArrowLeft, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LessonEditor } from "@/components/classroom/lesson-editor";

type CourseStatus = "draft" | "published";

interface CourseModule {
  id: number;
  title: string;
  order: number;
  summary?: string | null;
}

interface ModuleEditorProps {
  courseId: number;
  modules: CourseModule[];
  lessonCount: (moduleId: number) => number;
}

/**
 * Module management section for the course editor.
 * Shown above the lesson list when the course is in edit mode.
 */
function ModuleEditor({ courseId, modules, lessonCount }: ModuleEditorProps) {
  const t = useTranslations("classroom");
  const utils = api.useUtils();
  // Track per-module edited title (keyed by module id)
  const [editTitles, setEditTitles] = useState<Record<number, string>>({});
  const [deleteError, setDeleteError] = useState<Record<number, string>>({});

  const addModule = api.classrooms.addModule.useMutation({
    onSuccess: () => {
      void utils.classrooms.get.invalidate();
    },
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });

  const renameModule = api.classrooms.renameModule.useMutation({
    onSuccess: () => {
      void utils.classrooms.get.invalidate();
    },
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });

  const reorderModules = api.classrooms.reorderModules.useMutation({
    onSuccess: () => {
      void utils.classrooms.get.invalidate();
    },
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });

  const deleteModule = api.classrooms.deleteModule.useMutation({
    onSuccess: () => {
      void utils.classrooms.get.invalidate();
    },
    onError: (err, vars) => {
      const msg =
        err.message === "MODULE_NOT_EMPTY"
          ? t("moduleNotEmpty")
          : (err.message ?? t("deleteFailed"));
      setDeleteError((prev) => ({ ...prev, [vars.moduleId]: msg }));
    },
  });

  const dissolveModules = api.classrooms.dissolveModules.useMutation({
    onSuccess: () => {
      void utils.classrooms.get.invalidate();
    },
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });

  // Flat course: show a single prompt to organise into modules
  if (modules.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-base font-semibold">{t("modules")}</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={addModule.isPending}
          onClick={() =>
            addModule.mutate({ courseId, title: t("moduleDefaultTitle") })
          }
        >
          {t("organiseIntoModules")}
        </Button>
      </div>
    );
  }

  const moveUp = (index: number) => {
    if (index === 0) return;
    const reordered = [...modules];
    const prev = reordered[index - 1]!;
    const cur = reordered[index]!;
    reordered[index - 1] = cur;
    reordered[index] = prev;
    reorderModules.mutate({ courseId, orderedIds: reordered.map((m) => m.id) });
  };

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">{t("modules")}</h2>

      <div className="space-y-2">
        {modules.map((mod, index) => {
          const count = lessonCount(mod.id);
          const currentTitle = editTitles[mod.id] ?? mod.title;
          return (
            <div
              key={mod.id}
              className="border-border flex items-center gap-2 rounded-lg border px-3 py-2"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                disabled={index === 0 || reorderModules.isPending}
                onClick={() => moveUp(index)}
                aria-label={t("moveModuleUp")}
              >
                <ChevronUp className="size-4" />
              </Button>

              <Input
                className="h-7 flex-1 text-sm"
                value={currentTitle}
                onChange={(e) =>
                  setEditTitles((prev) => ({
                    ...prev,
                    [mod.id]: e.target.value,
                  }))
                }
                onBlur={() => {
                  const next = (editTitles[mod.id] ?? mod.title).trim();
                  if (next && next !== mod.title) {
                    renameModule.mutate({ moduleId: mod.id, title: next });
                  }
                }}
                maxLength={200}
                disabled={renameModule.isPending}
              />

              <span className="text-muted-foreground shrink-0 text-xs">
                {t("lessonCount", { count })}
              </span>

              {count === 0 && (
                <div className="flex shrink-0 flex-col items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive h-7 text-xs"
                    disabled={deleteModule.isPending}
                    onClick={() => {
                      setDeleteError((prev) => {
                        const next = { ...prev };
                        delete next[mod.id];
                        return next;
                      });
                      deleteModule.mutate({ moduleId: mod.id });
                    }}
                  >
                    {t("deleteModule")}
                  </Button>
                  {deleteError[mod.id] && (
                    <span className="text-destructive text-xs">
                      {deleteError[mod.id]}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={addModule.isPending}
          onClick={() =>
            addModule.mutate({
              courseId,
              title: `${t("moduleLabel")} ${modules.length + 1}`,
            })
          }
        >
          {t("addModule")}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground text-xs"
          disabled={dissolveModules.isPending}
          onClick={() => {
            if (confirm(t("dissolveModulesConfirm"))) {
              dissolveModules.mutate({ courseId });
            }
          }}
        >
          {t("dissolveModules")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Course create/edit UI. New mode (slug only) creates a course then redirects
 * to its edit page; edit mode (slug + courseSlug) loads the course and exposes
 * the course fields plus the lessons authoring section.
 */
export function CourseEditor({
  slug,
  courseSlug,
}: {
  slug: string;
  courseSlug?: string;
}) {
  const t = useTranslations("classroom");
  const router = useRouter();
  const utils = api.useUtils();
  const isEdit = !!courseSlug;

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<CourseStatus>("published");
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, refetch } = api.classrooms.get.useQuery(
    { slug: courseSlug ?? "" },
    { enabled: isEdit },
  );

  useEffect(() => {
    if (isEdit && data && !initialized) {
      setTitle(data.course.title ?? "");
      setSummary(data.course.summary ?? "");
      setStatus(data.course.status === "draft" ? "draft" : "published");
      setCoverImageUrl(data.course.coverImageUrl ?? null);
      setInitialized(true);
    }
  }, [isEdit, data, initialized]);

  const create = api.classrooms.create.useMutation({
    onSuccess: ({ slug: newSlug }) => {
      toast.success(t("courseCreated"));
      router.push(`/communities/${slug}/classroom/${newSlug}/edit` as never);
    },
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });

  const update = api.classrooms.update.useMutation({
    onSuccess: () => {
      toast.success(t("courseSaved"));
      void utils.classrooms.get.invalidate();
    },
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });

  const isSubmitting = create.isPending || update.isPending;

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
      setCoverImageUrl(json.url);
    } catch {
      toast.error(t("uploadFailed"));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = () => {
    const trimmed = title.trim();
    if (isEdit && data) {
      update.mutate({
        courseId: data.course.id,
        title: trimmed,
        summary: summary.trim(),
        status,
        coverImageUrl: coverImageUrl,
      });
    } else {
      create.mutate({
        communitySlug: slug,
        title: trimmed,
        summary: summary.trim() ? summary.trim() : undefined,
        status,
        coverImageUrl: coverImageUrl ?? undefined,
      });
    }
  };

  if (isEdit && isLoading) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        {t("loading")}
      </p>
    );
  }

  if (isEdit && isError) {
    return (
      <div className="mx-auto max-w-2xl py-6">
        <ErrorState onRetry={() => void refetch()} />
      </div>
    );
  }

  // Loaded in edit mode but the course is missing — surface a not-found state
  // rather than rendering a blank "create" form (No-Silent-Failure).
  if (isEdit && !data) {
    return (
      <div className="mx-auto max-w-2xl py-6">
        <EmptyState title={t("notFound")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-6">
      <Link
        href={`/communities/${slug}/classroom` as never}
        className="text-muted-foreground hover:text-foreground -mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> {t("backToClassrooms")}
      </Link>

      <div className="space-y-4">
        <h1 className="text-lg font-semibold">
          {isEdit ? t("editCourse") : t("createCourse")}
        </h1>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="course-title">{t("courseTitle")}</Label>
          <Input
            id="course-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            disabled={isSubmitting}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="course-summary">{t("courseSummary")}</Label>
          <Textarea
            id="course-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={isSubmitting}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{t("cover")}</Label>
          {coverImageUrl ? (
            <div className="relative inline-block w-full max-w-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverImageUrl}
                alt={t("cover")}
                className="aspect-video w-full rounded-lg object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 size-6"
                onClick={() => setCoverImageUrl(null)}
                aria-label={t("removeCover")}
                disabled={isSubmitting}
              >
                <X className="size-3" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={isUploading || isSubmitting}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-1.5 size-4" />
              )}
              {isUploading ? t("uploading") : t("addCover")}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleCoverUpload}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{t("status")}</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as CourseStatus)}
            disabled={isSubmitting}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="published">{t("publish")}</SelectItem>
              <SelectItem value="draft">{t("draft")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          onClick={handleSave}
          disabled={isSubmitting || title.trim().length < 3}
        >
          {t("save")}
        </Button>
      </div>

      {isEdit && data ? (
        <>
          <ModuleEditor
            courseId={data.course.id}
            modules={data.modules}
            lessonCount={(moduleId) =>
              data.lessons.filter((l) => (l.module ?? null) === moduleId).length
            }
          />
          <LessonEditor
            courseId={data.course.id}
            lessons={data.lessons}
            modules={data.modules}
          />
        </>
      ) : null}
    </div>
  );
}
