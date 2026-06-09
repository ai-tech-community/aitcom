"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import { ImagePlus, X, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LessonEditor } from "@/components/classroom/lesson-editor";

type CourseStatus = "draft" | "published";

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

  const { data, isLoading } = api.classrooms.get.useQuery(
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
        <LessonEditor courseId={data.course.id} lessons={data.lessons} />
      ) : null}
    </div>
  );
}
