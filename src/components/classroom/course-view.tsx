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
import {
  courseProgressPercent,
  youtubeEmbedUrl,
  type CommunityRole,
} from "@/lib/classroom";
import { Users, Check, Pencil, ExternalLink, Lock } from "lucide-react";

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

  const lessons = useMemo(
    () => (data?.lessons ?? []) as LessonLike[],
    [data?.lessons],
  );
  const completedLessonIds = data?.completedLessonIds ?? [];
  const enrolled = data?.enrolled ?? false;

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
    onSuccess: () =>
      router.push(`/communities/${slug}/classroom` as never),
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

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{course.title}</h1>
            <p className="text-muted-foreground text-sm">
              {t("byAuthor", { name: course.authorName ?? "member" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={course.isPublic ? "secondary" : "outline"}>
              {course.isPublic ? t("public") : t("membersOnly")}
            </Badge>
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

        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" /> {course.enrollmentCount ?? 0}
          </span>
        </div>

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
      </div>

      {/* Progress (enrolled) */}
      {enrolled ? (
        <div className="space-y-2">
          <Progress value={percent} />
          <p className="text-muted-foreground text-xs">
            {t("progress", { percent })}
          </p>
        </div>
      ) : null}

      {/* Enroll gate */}
      {!enrolled ? (
        <div className="space-y-4">
          <Button
            type="button"
            disabled={enroll.isPending}
            onClick={() => enroll.mutate({ courseId: course.id })}
          >
            {t("enroll")}
          </Button>
          <div>
            <h2 className="mb-2 text-sm font-medium">{t("lessons")}</h2>
            {lessons.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noLessons")}</p>
            ) : (
              <ul className="border-border divide-border divide-y rounded-lg border">
                {lessons.map((lesson) => (
                  <li
                    key={lesson.id}
                    className="text-muted-foreground flex items-center gap-2 px-4 py-2.5 text-sm"
                  >
                    <Lock className="size-3.5 shrink-0" />
                    {lesson.title}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">{t("lessons")}</h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={unenroll.isPending}
              onClick={() => unenroll.mutate({ courseId: course.id })}
            >
              {t("unenroll")}
            </Button>
          </div>

          {lessons.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noLessons")}</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
              {/* Lesson list */}
              <ul className="border-border divide-border h-fit divide-y rounded-lg border">
                {lessons.map((lesson) => {
                  const done = completedLessonIds.includes(lesson.id);
                  const active = selectedLesson?.id === lesson.id;
                  return (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(lesson.id)}
                        className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
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
                        {lesson.title}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* Selected lesson */}
              {selectedLesson ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold">
                      {selectedLesson.title}
                    </h3>
                    {(() => {
                      const isCompleted = completedLessonIds.includes(
                        selectedLesson.id,
                      );
                      return (
                        <Button
                          type="button"
                          variant={isCompleted ? "outline" : "default"}
                          size="sm"
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
                    })()}
                  </div>

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
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
