"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { toast } from "sonner";
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
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading } = api.classrooms.get.useQuery(
    { slug: courseSlug ?? "" },
    { enabled: isEdit },
  );

  useEffect(() => {
    if (isEdit && data && !initialized) {
      setTitle(data.course.title ?? "");
      setSummary(data.course.summary ?? "");
      setStatus(data.course.status === "draft" ? "draft" : "published");
      setInitialized(true);
    }
  }, [isEdit, data, initialized]);

  const create = api.classrooms.create.useMutation({
    onSuccess: ({ slug: newSlug }) => {
      toast.success(t("courseCreated"));
      router.push(
        `/communities/${slug}/classroom/${newSlug}/edit` as never,
      );
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

  const handleSave = () => {
    const trimmed = title.trim();
    if (isEdit && data) {
      update.mutate({
        courseId: data.course.id,
        title: trimmed,
        summary: summary.trim(),
        status,
      });
    } else {
      create.mutate({
        communitySlug: slug,
        title: trimmed,
        summary: summary.trim() ? summary.trim() : undefined,
        status,
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
