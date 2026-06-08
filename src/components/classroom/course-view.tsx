"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LexicalRenderer } from "@/lib/lexical";
import { ExamRunner } from "./exam-runner";
import {
  courseProgressPercent,
  youtubeEmbedUrl,
  type CommunityRole,
} from "@/lib/classroom";
import {
  Users,
  Check,
  Pencil,
  ExternalLink,
  Lock,
  Eye,
  ArrowLeft,
} from "lucide-react";

interface ResourceRow {
  label: string;
  url: string;
}

interface LessonLike {
  id: number;
  title: string;
  youtubeUrl?: string | null;
  body?: unknown;
  resources?: ResourceRow[] | null;
}

export function CourseView({
  slug,
  courseSlug,
}: {
  slug: string;
  courseSlug: string;
}) {
  const t = useTranslations("classroom");
  const router = useRouter();
  const utils = api.useUtils();
  const { data: session } = authClient.useSession();

  const { data, isLoading, isError } = api.classrooms.get.useQuery({
    slug: courseSlug,
  });

  const { data: mine } = api.communities.getMyCommunities.useQuery(undefined, {
    enabled: !!session?.user,
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const lessons = useMemo(
    () => (data?.lessons ?? []) as LessonLike[],
    [data?.lessons],
  );
  const completedLessonIds = data?.completedLessonIds ?? [];
  const enrolled = data?.enrolled ?? false;
  const lessonExams = data?.lessonExams ?? [];
  const attempts = data?.attempts ?? [];
  const certificateIssuedAt = data?.certificateIssuedAt ?? null;

  const selectedLesson =
    lessons.find((l) => l.id === selectedId) ?? lessons[0] ?? null;

  const membership = mine?.find((c) => c.slug === slug);
  const role =
    (membership?.status === "active"
      ? (membership.role as CommunityRole)
      : null) ?? null;
  const isStaff = role === "owner" || role === "admin" || role === "moderator";
  const isAuthor =
    !!session?.user && data?.course.authorId === session.user.id;
  const canPreview = isAuthor || isStaff;

  // Real enrollment OR an author/staff member previewing unlocks lesson content.
  const canViewContent = enrolled || previewing;

  const enroll = api.classrooms.enroll.useMutation({
    onSuccess: () => void utils.classrooms.get.invalidate({ slug: courseSlug }),
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });
  const unenroll = api.classrooms.unenroll.useMutation({
    onSuccess: () => void utils.classrooms.get.invalidate({ slug: courseSlug }),
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });
  const markComplete = api.classrooms.markLessonComplete.useMutation({
    onSuccess: () => void utils.classrooms.get.invalidate({ slug: courseSlug }),
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });
  const setPublic = api.classrooms.setPublic.useMutation({
    onSuccess: () => void utils.classrooms.get.invalidate({ slug: courseSlug }),
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });
  const archive = api.classrooms.moderateArchive.useMutation({
    onSuccess: () => router.push(`/communities/${slug}/classroom` as never),
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });

  if (isLoading) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        {t("loading")}
      </p>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        {t("notFound")}
      </p>
    );
  }

  const { course } = data;
  const percent = courseProgressPercent(
    completedLessonIds.length,
    lessons.length,
  );
  const embed = selectedLesson?.youtubeUrl
    ? youtubeEmbedUrl(selectedLesson.youtubeUrl)
    : null;
  const coverImageUrl = (course as { coverImageUrl?: string | null })
    .coverImageUrl;

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-6">
      <Link
        href={`/communities/${slug}/classroom` as never}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> {t("backToClassrooms")}
      </Link>

      {/* Header */}
      <div className="space-y-4">
        {coverImageUrl ? (
          <div className="border-border overflow-hidden rounded-xl border">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external URLs */}
            <img
              src={coverImageUrl}
              alt={course.title}
              className="aspect-[16/5] w-full object-cover"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{course.title}</h1>
            <p className="text-muted-foreground text-sm">
              {t("byAuthor", { name: course.authorName ?? "member" })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={course.isPublic ? "secondary" : "outline"}>
              {course.isPublic ? t("public") : t("membersOnly")}
            </Badge>
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <Users className="size-3" /> {course.enrollmentCount ?? 0}
            </span>
            {canPreview ? (
              <Button
                type="button"
                variant={previewing ? "secondary" : "outline"}
                size="sm"
                onClick={() => setPreviewing((p) => !p)}
              >
                <Eye className="mr-1.5 size-4" />
                {previewing ? t("exitPreview") : t("preview")}
              </Button>
            ) : null}
            {isAuthor ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={
                    `/communities/${slug}/classroom/${courseSlug}/edit` as never
                  }
                >
                  <Pencil className="mr-1.5 size-4" /> {t("editCourse")}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {course.summary ? (
          <p className="text-muted-foreground text-sm">{course.summary}</p>
        ) : null}

        {/* Staff controls */}
        {isStaff ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={setPublic.isPending}
              onClick={() =>
                setPublic.mutate({
                  courseId: course.id,
                  isPublic: !course.isPublic,
                })
              }
            >
              {course.isPublic ? t("makeMembersOnly") : t("makePublic")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={archive.isPending}
              onClick={() => {
                if (confirm(t("removeCourseConfirm"))) {
                  archive.mutate({ courseId: course.id });
                }
              }}
            >
              {t("removeCourse")}
            </Button>
          </div>
        ) : null}

        {previewing ? (
          <div className="border-border bg-secondary/40 text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
            <Eye className="size-3.5 shrink-0" />
            {t("previewMode")}
          </div>
        ) : null}
      </div>

      {/* Two-pane layout */}
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        {/* Left sidebar */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold">{course.title}</h2>

            {canViewContent ? (
              <div className="space-y-1.5">
                <Progress value={percent} />
                <p className="text-muted-foreground text-xs">
                  {t("progress", { percent })}
                </p>
              </div>
            ) : null}

            {certificateIssuedAt ? (
              <div className="rounded-md border border-green-600/30 bg-green-600/10 p-3 text-center">
                <p className="text-sm font-semibold text-green-700">
                  {t("certificateEarned")}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("certificateIssued", {
                    date: new Date(certificateIssuedAt).toLocaleDateString(),
                  })}
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                  {t("lessons")}
                </h3>
                {enrolled && !previewing ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto px-1.5 py-0.5 text-xs"
                    disabled={unenroll.isPending}
                    onClick={() => unenroll.mutate({ courseId: course.id })}
                  >
                    {t("unenroll")}
                  </Button>
                ) : null}
              </div>

              {lessons.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("noLessons")}
                </p>
              ) : (
                <ul className="border-border divide-border divide-y overflow-hidden rounded-lg border">
                  {lessons.map((lesson) => {
                    const done = completedLessonIds.includes(lesson.id);
                    const active = selectedLesson?.id === lesson.id;
                    if (!canViewContent) {
                      return (
                        <li
                          key={lesson.id}
                          className="text-muted-foreground flex items-center gap-2 px-3 py-2.5 text-sm"
                        >
                          <Lock className="size-3.5 shrink-0" />
                          <span className="truncate">{lesson.title}</span>
                        </li>
                      );
                    }
                    return (
                      <li key={lesson.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(lesson.id)}
                          className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                            active
                              ? "bg-secondary/60 font-medium"
                              : "hover:bg-secondary/40"
                          }`}
                        >
                          <span
                            className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                              done
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border"
                            }`}
                          >
                            {done ? <Check className="size-3" /> : null}
                          </span>
                          <span className="truncate">{lesson.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {!enrolled && !previewing ? (
              <Button
                type="button"
                className="w-full"
                disabled={enroll.isPending}
                onClick={() => enroll.mutate({ courseId: course.id })}
              >
                {t("enroll")}
              </Button>
            ) : null}
          </div>
        </aside>

        {/* Right pane */}
        <main className="min-w-0">
          {!canViewContent ? (
            <div className="border-border bg-secondary/20 flex flex-col items-center justify-center gap-4 rounded-xl border px-6 py-16 text-center">
              <Lock className="text-muted-foreground size-8 opacity-50" />
              <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
              <Button
                type="button"
                disabled={enroll.isPending}
                onClick={() => enroll.mutate({ courseId: course.id })}
              >
                {t("enroll")}
              </Button>
            </div>
          ) : !selectedLesson ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              {t("noLessons")}
            </p>
          ) : (
            <div className="space-y-4">
              {/* Video */}
              {embed ? (
                <div className="relative aspect-video w-full overflow-hidden rounded-lg">
                  <iframe
                    src={embed}
                    title={selectedLesson.title}
                    allowFullScreen
                    className="absolute inset-0 size-full"
                  />
                </div>
              ) : selectedLesson.youtubeUrl ? (
                <a
                  href={selectedLesson.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex items-center gap-1.5 text-sm underline underline-offset-4 hover:opacity-80"
                >
                  <ExternalLink className="size-4" />
                  {t("watchVideo")}
                </a>
              ) : null}

              {/* Title + mark complete */}
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-xl font-semibold">
                  {selectedLesson.title}
                </h3>
                {enrolled && !previewing
                  ? (() => {
                      const isCompleted = completedLessonIds.includes(
                        selectedLesson.id,
                      );
                      const exam = lessonExams.find(
                        (e) => e.lessonId === selectedLesson.id,
                      );
                      if (exam?.mandatory) {
                        return null; // gated: completion only via the runner below
                      }
                      return (
                        <Button
                          type="button"
                          variant={isCompleted ? "outline" : "default"}
                          size="sm"
                          className="shrink-0"
                          disabled={markComplete.isPending}
                          onClick={() =>
                            markComplete.mutate({
                              lessonId: selectedLesson.id,
                              completed: !isCompleted,
                            })
                          }
                        >
                          {isCompleted
                            ? t("markIncomplete")
                            : t("markComplete")}
                        </Button>
                      );
                    })()
                  : null}
              </div>

              {/* Body */}
              {selectedLesson.body ? (
                <LexicalRenderer content={selectedLesson.body} />
              ) : null}

              {/* Resources */}
              {selectedLesson.resources &&
              selectedLesson.resources.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">{t("resources")}</h4>
                  <ul className="space-y-1">
                    {selectedLesson.resources.map((r, i) => (
                      <li key={i}>
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary inline-flex items-center gap-1.5 text-sm underline underline-offset-4 hover:opacity-80"
                        >
                          <ExternalLink className="size-3.5" />
                          {r.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Exam — visible to enrolled learners and to authors previewing */}
              {canViewContent
                ? (() => {
                    const exam = lessonExams.find(
                      (e) =>
                        e.lessonId === selectedLesson.id &&
                        e.questions.length > 0,
                    );
                    if (!exam) return null;
                    return (
                      <ExamRunner
                        exam={exam}
                        attempts={attempts}
                        completed={completedLessonIds.includes(
                          selectedLesson.id,
                        )}
                        preview={previewing}
                      />
                    );
                  })()
                : null}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
