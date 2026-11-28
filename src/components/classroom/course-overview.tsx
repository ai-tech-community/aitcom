import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, BookOpen, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import type { RouterOutputs } from "@/trpc/react";
import { cn } from "@/lib/utils";
import {
  CourseCurriculum,
  type CurriculumGroup,
  type CurriculumLesson,
  type CurriculumLinkRenderer,
  type LessonLinkRenderer,
} from "./course-curriculum";

export type CourseAction = { run: () => void; pending: boolean };

export function CourseOverview({
  course,
  heading,
  progress,
  groups,
  completed,
  lessonCount,
  completedCount,
  resume,
  allDone,
  tracking,
  canLearn,
  member,
  accent,
  embedded,
  certificate,
  enroll,
  editHref,
  classroomHref,
  renderCurriculumLink,
  lessonLink,
}: {
  course: RouterOutputs["classrooms"]["get"]["course"];
  heading: ReactNode;
  progress: ReactNode;
  groups: CurriculumGroup[];
  completed: ReadonlySet<number>;
  lessonCount: number;
  completedCount: number;
  resume?: CurriculumLesson;
  allDone: boolean;
  tracking: boolean;
  canLearn: boolean;
  member: boolean;
  accent: boolean;
  embedded: boolean;
  certificate: ReactNode;
  enroll?: CourseAction;
  editHref?: string;
  classroomHref: string;
  renderCurriculumLink?: CurriculumLinkRenderer;
  lessonLink: LessonLinkRenderer;
}) {
  const t = useTranslations("redesign.classroom");
  const existing = useTranslations("classroom");
  return (
    <div>
      <header className="border-border grid items-start gap-6 border-b pb-7 sm:pb-9 @3xl:grid-cols-[minmax(0,1fr)_minmax(15rem,0.52fr)] @3xl:gap-10">
        <div className="min-w-0 space-y-4">
          {heading}
          {course.summary ? (
            <p className="text-muted-foreground max-w-prose text-base leading-relaxed [overflow-wrap:anywhere] sm:text-lg">
              {course.summary}
            </p>
          ) : null}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {course.authorName ? (
              <span>{existing("byAuthor", { name: course.authorName })}</span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Users aria-hidden="true" className="size-4 shrink-0" />
              {t("learnerCount", { count: course.enrollmentCount ?? 0 })}
            </span>
            {course.isPublic || !member ? (
              <span>
                {course.isPublic ? existing("public") : existing("membersOnly")}
              </span>
            ) : null}
            {course.status !== "published" ? (
              <span>
                {course.status === "draft"
                  ? existing("draft")
                  : existing("archivedBadge")}
              </span>
            ) : null}
          </div>
        </div>

        <div className="border-border min-w-0 space-y-4 border-t pt-4 @3xl:border-t-0 @3xl:border-l @3xl:pt-1 @3xl:pl-6">
          {tracking ? (
            <div aria-live="polite">{progress}</div>
          ) : (
            <div className="text-muted-foreground space-y-2 text-sm">
              <p className="flex items-center gap-2">
                <BookOpen aria-hidden="true" className="size-4 shrink-0" />
                {t("lessonCount", { count: lessonCount })}
              </p>
              {!canLearn && lessonCount > 0 ? (
                <p>{enroll ? t("lockedUntilEnrollment") : t("lockedCourse")}</p>
              ) : null}
            </div>
          )}

          {enroll ? (
            <Button
              variant={accent ? "default" : "ink"}
              disabled={enroll.pending}
              onClick={enroll.run}
              className="h-auto min-h-11 w-full justify-between text-left whitespace-normal @3xl:w-auto"
            >
              {existing("enroll")}
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : canLearn && resume ? (
            <Button
              asChild
              variant={accent ? "default" : "ink"}
              className="h-auto min-h-11 w-full justify-between text-left whitespace-normal @3xl:w-auto"
            >
              {lessonLink(
                resume,
                <>
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {tracking
                      ? allDone
                        ? t("reviewCourse")
                        : completedCount
                          ? t("resumeLesson", { title: resume.title })
                          : t("startCourse")
                      : t("openFirstLesson")}
                  </span>
                  <ArrowRight aria-hidden="true" />
                </>,
              )}
            </Button>
          ) : null}

          {certificate}
        </div>
      </header>

      <div className="grid items-start gap-6 pt-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(15rem,0.52fr)] @3xl:gap-10">
        {course.coverImageUrl ? (
          <div className="order-first @3xl:order-last">
            {/* eslint-disable-next-line @next/next/no-img-element -- author cover hosts are unrestricted */}
            <img
              src={course.coverImageUrl}
              alt=""
              className="bg-muted aspect-video w-full rounded-xl object-cover"
            />
          </div>
        ) : null}
        <section
          className={cn(
            "min-w-0 space-y-5",
            !course.coverImageUrl && "@3xl:col-span-full",
          )}
        >
          <SectionLabel>{t("curriculum")}</SectionLabel>
          {lessonCount > 0 ? (
            <CourseCurriculum
              groups={groups}
              completed={completed}
              tracking={tracking}
              nextLessonId={tracking && !allDone ? resume?.id : undefined}
              renderLink={renderCurriculumLink}
            />
          ) : (
            <EmptyState
              icon={<BookOpen />}
              title={t("emptyCurriculum")}
              description={
                editHref
                  ? t("emptyCurriculumAuthor")
                  : t("emptyCurriculumVisitor")
              }
              action={
                editHref ? (
                  <Button asChild variant="outline">
                    <Link href={editHref as never}>
                      {existing("editCourse")}
                    </Link>
                  </Button>
                ) : !embedded ? (
                  <Button asChild variant="outline">
                    <Link href={classroomHref as never}>{t("courses")}</Link>
                  </Button>
                ) : null
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}
