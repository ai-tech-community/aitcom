"use client";

import styles from "./classroom.module.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, Award, Eye, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { nextUnfinishedLesson } from "@/lib/classroom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useRouter } from "@/i18n/navigation";
import type { RouterOutputs } from "@/trpc/react";
import { cn } from "@/lib/utils";
import {
  CourseCurriculum,
  type CurriculumGroup,
  type CurriculumLinkRenderer,
  type LessonLinkRenderer,
} from "./course-curriculum";
import { LearningProgress } from "./learning-progress";
import { CourseOverview, type CourseAction } from "./course-overview";
import { CourseFinish } from "./course-finish";
import { LessonPlayer, type LessonCompletion } from "./lesson-player";

type Course = RouterOutputs["classrooms"]["get"]["course"];

interface CourseLearningViewProps {
  course: Course;
  classroomHref: string;
  courseHref: string;
  groups: CurriculumGroup[];
  completed: ReadonlySet<number>;
  percent: number;
  certificate: Date | null;
  embedded: boolean;
  accent: boolean;
  previewing: boolean;
  enrolled: boolean;
  member: boolean;
  memberId?: string;
  editHref?: string;
  onPreview?: () => void;
  visibility?: CourseAction;
  archive?: CourseAction;
  enroll?: CourseAction;
  unenroll?: CourseAction;
  completion?: LessonCompletion;
  mandatoryExams: ReadonlySet<number>;
  renderLesson: (lessonId: number, onExamPassed?: () => void) => ReactNode;
}

export function CourseLearningView({
  course,
  classroomHref,
  courseHref,
  groups,
  completed,
  percent,
  certificate,
  embedded,
  accent,
  previewing,
  enrolled,
  member,
  memberId,
  editHref,
  onPreview,
  visibility,
  archive,
  enroll,
  unenroll,
  completion,
  mandatoryExams,
  renderLesson,
}: CourseLearningViewProps) {
  const t = useTranslations("redesign.classroom");
  const existing = useTranslations("classroom");
  const format = useFormatter();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [previewLessonId, setPreviewLessonId] = useState<number>();
  const [outlineOpen, setOutlineOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  const jumpFromOutline = useRef(false);
  const requestedLesson = embedded
    ? String(previewLessonId)
    : searchParams.get("lesson");
  const lessons = groups.flatMap((group) => group.lessons);
  const canLearn = enrolled || previewing;
  const index = canLearn
    ? lessons.findIndex(({ id }) => String(id) === requestedLesson)
    : -1;
  const active = lessons[index];
  const previous = index > 0 ? lessons[index - 1] : undefined;
  const next = index >= 0 ? lessons[index + 1] : undefined;
  const activeGroup = groups.find((group) =>
    group.lessons.some((lesson) => lesson.id === active?.id),
  );
  // A completed course can still be reviewed from the first lesson.
  const resume =
    (enrolled && !previewing
      ? nextUnfinishedLesson(lessons, completed)
      : undefined) ?? lessons[0];
  const done = !!active && completed.has(active.id);
  const tracking = enrolled && !previewing;
  const completedCount = lessons.filter(({ id }) => completed.has(id)).length;
  const allDone = lessons.length > 0 && completedCount === lessons.length;
  const otherUnfinished = lessons.find(
    ({ id }) => id !== active?.id && !completed.has(id),
  );

  const showFinish =
    !embedded && tracking && allDone && searchParams.get("complete") === "1";
  const resolvingResume =
    !embedded &&
    tracking &&
    !!resume &&
    !allDone &&
    searchParams.get("resume") === "1";
  const resumeHref = resolvingResume
    ? `${courseHref}?lesson=${resume?.id}`
    : undefined;

  useEffect(() => {
    if (resumeHref) router.replace(resumeHref as never, { scroll: false });
  }, [resumeHref, router]);

  const screen = showFinish ? "complete" : active?.id;
  const previousScreen = useRef(screen);
  useEffect(() => {
    if (screen === previousScreen.current) return;
    previousScreen.current = screen;
    heading.current?.focus({ preventScroll: true });
    if (embedded) {
      frame.current?.scrollIntoView({ block: "start" });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [embedded, screen]);

  function advanceAfterCompletion(announce = true) {
    if (!active || done || !tracking || embedded) return;
    if (!otherUnfinished) {
      router.push(`${courseHref}?complete=1` as never, { scroll: false });
      return;
    }
    const destination = next ?? otherUnfinished;
    if (announce) toast.success(t("lessonSaved", { title: active.title }));
    router.push(`${courseHref}?lesson=${destination.id}` as never, {
      scroll: false,
    });
  }

  async function completeActiveLesson() {
    if (!active || !completion || completion.pending) return;
    const from = window.location.href;
    const saved = await completion.run(active.id, !done);
    if (saved && window.location.href === from) advanceAfterCompletion();
  }

  const lessonLink: LessonLinkRenderer = (
    lesson,
    children,
    className,
    current,
  ) => {
    const closeOutline = () => {
      jumpFromOutline.current = outlineOpen && lesson?.id !== active?.id;
      setOutlineOpen(false);
    };
    if (embedded) {
      return (
        <button
          type="button"
          className={className}
          aria-current={current}
          onClick={() => {
            setPreviewLessonId(lesson?.id);
            closeOutline();
          }}
        >
          {children}
        </button>
      );
    }

    return (
      <Link
        href={
          (lesson ? `${courseHref}?lesson=${lesson.id}` : courseHref) as never
        }
        scroll={false}
        className={className}
        aria-current={current}
        onNavigate={closeOutline}
      >
        {children}
      </Link>
    );
  };

  const renderCurriculumLink: CurriculumLinkRenderer = (lesson, props) =>
    lessonLink(lesson, props.children, props.className, props["aria-current"]);
  const progress = (
    <LearningProgress
      percent={percent}
      completed={completedCount}
      total={lessons.length}
    />
  );
  const compactCurriculum = (
    <CourseCurriculum
      groups={groups}
      completed={completed}
      compact
      tracking={tracking}
      selectedId={active?.id}
      renderLink={renderCurriculumLink}
    />
  );
  const courseTitleClass =
    "scroll-mt-[calc(var(--shell-top-offset)+1.25rem)] text-3xl font-semibold tracking-tight text-pretty outline-none [overflow-wrap:anywhere] @xl:text-5xl";
  const Heading = embedded ? "h2" : "h1";
  const pageHeading = (
    <Heading
      id={active ? "classroom-lesson-title" : undefined}
      ref={heading}
      tabIndex={-1}
      className={cn(
        courseTitleClass,
        !active && !embedded && "font-community-heading",
      )}
    >
      {showFinish ? t("finishTitle") : (active?.title ?? course.title)}
    </Heading>
  );

  const certificateDate = certificate
    ? format.dateTime(certificate, { dateStyle: "medium" })
    : null;
  const certificateStatus = certificateDate ? (
    allDone ? (
      <div className="flex items-start gap-2 text-sm">
        <Award aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">{t("certificateEarned")}</p>
          <p className="text-muted-foreground">
            {existing("certificateIssued", { date: certificateDate })}
          </p>
        </div>
      </div>
    ) : (
      <p className="text-muted-foreground text-sm">
        {t("certificateIssuedEarlier", { date: certificateDate })}
      </p>
    )
  ) : null;
  const hasCourseMenu = Boolean(onPreview ?? visibility ?? archive ?? unenroll);

  async function confirmLeaveCourse() {
    if (!unenroll || unenroll.pending) return;
    const label = existing("unenroll");
    if (
      await confirm({
        title: t("leaveCourseTitle"),
        description: t("leaveCourseDescription"),
        confirmLabel: label,
        destructive: true,
        returnFocus: () => actionsTrigger.current,
      })
    ) {
      unenroll.run();
    }
  }

  if (resolvingResume) {
    return (
      <div
        aria-busy="true"
        className={cn("mx-auto max-w-6xl space-y-5 py-8", styles.controls)}
      >
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-12 max-w-xl" />
        <Skeleton className="h-32 max-w-3xl" />
      </div>
    );
  }

  return (
    <div
      ref={frame}
      data-classroom-redesign=""
      className={cn(
        "@container mx-auto max-w-6xl scroll-mt-[calc(var(--shell-top-offset)+1rem)] py-1 sm:py-4",
        styles.controls,
      )}
    >
      {showFinish ? null : (
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 sm:mb-5">
          {active ? (
            <Button
              asChild
              variant="ghost"
              className="-ml-2 min-w-0 whitespace-normal"
            >
              {lessonLink(
                undefined,
                <>
                  <ArrowLeft aria-hidden="true" />
                  {t("courseOverview")}
                </>,
              )}
            </Button>
          ) : !embedded ? (
            <Button
              asChild
              variant="ghost"
              className="-ml-2 min-w-0 whitespace-normal"
            >
              <Link href={classroomHref as never}>
                <ArrowLeft aria-hidden="true" />
                {t("courses")}
              </Link>
            </Button>
          ) : null}

          {!active && (editHref || hasCourseMenu) ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {editHref ? (
                <Button asChild variant="outline" className="shadow-none">
                  <Link href={editHref as never}>{existing("editCourse")}</Link>
                </Button>
              ) : null}
              {hasCourseMenu ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      ref={actionsTrigger}
                      variant="ghost"
                      size="icon"
                      aria-label={t("courseActions")}
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="motion-reduce:animate-none"
                  >
                    {onPreview ? (
                      <DropdownMenuItem
                        className="min-h-11"
                        onSelect={onPreview}
                      >
                        {previewing
                          ? existing("exitPreview")
                          : existing("preview")}
                      </DropdownMenuItem>
                    ) : null}
                    {visibility ? (
                      <DropdownMenuItem
                        className="min-h-11"
                        disabled={visibility.pending}
                        onSelect={visibility.run}
                      >
                        {course.isPublic
                          ? existing("makeMembersOnly")
                          : existing("makePublic")}
                      </DropdownMenuItem>
                    ) : null}
                    {unenroll ? (
                      <DropdownMenuItem
                        className="min-h-11"
                        variant="destructive"
                        disabled={unenroll.pending}
                        onSelect={() => void confirmLeaveCourse()}
                      >
                        {existing("unenroll")}
                      </DropdownMenuItem>
                    ) : null}
                    {archive ? (
                      <DropdownMenuItem
                        className="min-h-11"
                        variant="destructive"
                        disabled={archive.pending}
                        onSelect={archive.run}
                      >
                        {existing("removeCourse")}
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {previewing ? (
        <div className="bg-muted text-muted-foreground mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm">
          <p className="flex min-w-0 items-center gap-2">
            <Eye aria-hidden="true" className="size-4 shrink-0" />
            {existing("previewMode")}
          </p>
          {active && onPreview ? (
            <Button variant="ghost" size="sm" onClick={onPreview}>
              {existing("exitPreview")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {showFinish ? (
        <CourseFinish
          title={course.title}
          heading={pageHeading}
          progress={progress}
          certificate={certificateStatus}
          certificateHref={
            certificate && memberId
              ? `/members/${memberId}/work#certificates`
              : undefined
          }
          coursesHref={classroomHref}
          accent={accent}
        />
      ) : active ? (
        <LessonPlayer
          active={active}
          moduleTitle={activeGroup?.module?.title}
          courseTitle={course.title}
          previous={previous}
          next={next}
          position={index + 1}
          lessonCount={lessons.length}
          tracking={tracking}
          accent={accent}
          done={done}
          allDone={allDone}
          completesCourse={!otherUnfinished}
          mandatoryExam={mandatoryExams.has(active.id)}
          certificate={certificateStatus}
          completion={completion}
          onComplete={() => void completeActiveLesson()}
          outlineOpen={outlineOpen}
          onOutlineOpenChange={setOutlineOpen}
          onOutlineCloseAutoFocus={(event) => {
            if (!jumpFromOutline.current) return;
            event.preventDefault();
            heading.current?.focus({ preventScroll: true });
            jumpFromOutline.current = false;
          }}
          curriculum={compactCurriculum}
          progress={progress}
          heading={pageHeading}
          lessonLink={lessonLink}
        >
          {renderLesson(
            active.id,
            tracking && !done ? () => advanceAfterCompletion(false) : undefined,
          )}
        </LessonPlayer>
      ) : (
        <CourseOverview
          course={course}
          heading={pageHeading}
          progress={progress}
          groups={groups}
          completed={completed}
          lessonCount={lessons.length}
          completedCount={completedCount}
          resume={resume}
          allDone={allDone}
          tracking={tracking}
          canLearn={canLearn}
          member={member}
          accent={accent}
          embedded={embedded}
          certificate={certificateStatus}
          enroll={enroll}
          editHref={editHref}
          classroomHref={classroomHref}
          renderCurriculumLink={canLearn ? renderCurriculumLink : undefined}
          lessonLink={lessonLink}
        />
      )}
    </div>
  );
}
