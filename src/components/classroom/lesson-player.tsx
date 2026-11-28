import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Award, Check, ListTree, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { CurriculumLesson, LessonLinkRenderer } from "./course-curriculum";

export type LessonCompletion = {
  pending: boolean;
  run: (lessonId: number, completed: boolean) => Promise<boolean>;
};

export function LessonPlayer({
  active,
  moduleTitle,
  courseTitle,
  previous,
  next,
  position,
  lessonCount,
  tracking,
  accent,
  done,
  allDone,
  mandatoryExam,
  certificate,
  completion,
  onComplete,
  outlineOpen,
  onOutlineOpenChange,
  onOutlineCloseAutoFocus,
  curriculum,
  progress,
  heading,
  lessonLink,
  children,
}: {
  active: CurriculumLesson;
  moduleTitle?: string;
  courseTitle: string;
  previous?: CurriculumLesson;
  next?: CurriculumLesson;
  position: number;
  lessonCount: number;
  tracking: boolean;
  accent: boolean;
  done: boolean;
  allDone: boolean;
  mandatoryExam: boolean;
  certificate: ReactNode;
  completion?: LessonCompletion;
  onComplete: () => void;
  outlineOpen: boolean;
  onOutlineOpenChange: (open: boolean) => void;
  onOutlineCloseAutoFocus: (event: Event) => void;
  curriculum: ReactNode;
  progress: ReactNode;
  heading: ReactNode;
  lessonLink: LessonLinkRenderer;
  children: ReactNode;
}) {
  const t = useTranslations("redesign.classroom");
  const existing = useTranslations("classroom");
  const common = useTranslations("common");
  return (
    <div className="grid items-start gap-x-8 gap-y-5 @3xl:grid-cols-[minmax(13rem,1fr)_minmax(0,2.6fr)] @5xl:gap-x-12">
      <aside className="border-border hidden min-w-0 @3xl:sticky @3xl:top-[calc(var(--shell-top-offset)+1.25rem)] @3xl:flex @3xl:max-h-[calc(100dvh-var(--shell-top-offset)-2.5rem)] @3xl:flex-col @3xl:gap-4 @3xl:border-r @3xl:pr-4">
        <div className="space-y-3">
          <p className="text-sm font-semibold [overflow-wrap:anywhere]">
            {courseTitle}
          </p>
          {tracking ? progress : null}
          <SectionLabel>{t("curriculum")}</SectionLabel>
        </div>
        <nav
          aria-label={t("curriculum")}
          className="flex min-h-0 flex-1 flex-col"
        >
          {curriculum}
        </nav>
      </aside>

      <div className="border-border border-b pb-4 @3xl:hidden">
        <Sheet open={outlineOpen} onOpenChange={onOutlineOpenChange}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              className="flex min-h-11 w-full justify-between gap-2 shadow-none"
            >
              <span className="flex items-center gap-2">
                <ListTree aria-hidden="true" className="size-4" />
                {t("curriculum")}
              </span>
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {position}/{lessonCount}
              </span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            showCloseButton={false}
            onCloseAutoFocus={onOutlineCloseAutoFocus}
            className="w-[min(90vw,24rem)] max-w-none gap-0 motion-reduce:animate-none motion-reduce:transition-none"
          >
            <SheetHeader className="border-border shrink-0 border-b">
              <div className="flex items-center justify-between gap-2">
                <SheetTitle>{t("curriculum")}</SheetTitle>
                <SheetClose asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={common("close")}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </SheetClose>
              </div>
              <SheetDescription className="[overflow-wrap:anywhere]">
                {courseTitle}
              </SheetDescription>
              {tracking ? <div className="pt-2">{progress}</div> : null}
            </SheetHeader>
            <nav
              aria-label={t("curriculum")}
              className="flex min-h-0 flex-1 flex-col p-4"
            >
              {curriculum}
            </nav>
          </SheetContent>
        </Sheet>
        {tracking ? <div className="mt-3">{progress}</div> : null}
      </div>

      <article aria-labelledby="classroom-lesson-title" className="min-w-0">
        <header className="border-border space-y-2 border-b pb-5">
          <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="font-mono text-xs tabular-nums">
              {t("lessonPosition", {
                position: position,
                total: lessonCount,
              })}
            </span>
            {moduleTitle ? (
              <span className="[overflow-wrap:anywhere]">{moduleTitle}</span>
            ) : null}
            <span
              role="status"
              className="text-foreground inline-flex items-center gap-1.5 empty:hidden"
            >
              {done && tracking ? (
                <>
                  <Check aria-hidden="true" className="size-4" />
                  {t("lessonCompleted")}
                </>
              ) : null}
            </span>
          </div>
          {heading}
        </header>
        <div key={active.id} className="max-w-3xl min-w-0 py-5 sm:py-7">
          {children}
        </div>

        <footer
          aria-label={t("lessonNavigation")}
          className="border-border space-y-4 border-t pt-5"
        >
          {next ? (
            <p className="text-muted-foreground text-sm [overflow-wrap:anywhere]">
              {t("upNext", { title: next.title })}
            </p>
          ) : null}
          {certificate ??
            (!next && allDone && tracking ? (
              <p
                role="status"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <Award aria-hidden="true" className="size-4 shrink-0" />
                {t("courseCompleted")}
              </p>
            ) : null)}
          <div className="flex flex-wrap items-center gap-2">
            {tracking && completion && !mandatoryExam ? (
              <Button
                className={cn(
                  "motion-reduce:transition-none",
                  done && "shadow-none",
                )}
                variant={done ? "outline" : accent ? "default" : "ink"}
                aria-disabled={completion.pending || undefined}
                aria-busy={completion.pending || undefined}
                onClick={() => {
                  if (!completion.pending) onComplete();
                }}
              >
                {done
                  ? existing("markIncomplete")
                  : t(next ? "completeAndContinue" : "completeCourse")}
              </Button>
            ) : null}
          </div>
          {previous || next ? (
            <nav
              aria-label={t("skipLessonNavigation")}
              className="border-border flex flex-wrap justify-between gap-x-5 border-t pt-2"
            >
              {previous
                ? lessonLink(
                    previous,
                    <>
                      <ArrowLeft aria-hidden="true" className="size-4" />
                      {t("previousLesson")}
                    </>,
                    "text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 items-center gap-2 rounded-sm text-sm underline-offset-4 hover:underline focus-visible:ring-2",
                  )
                : null}
              {next
                ? lessonLink(
                    next,
                    <>
                      {t("nextLesson")}
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </>,
                    "text-muted-foreground hover:text-foreground focus-visible:ring-ring ml-auto inline-flex min-h-11 items-center gap-2 rounded-sm text-sm underline-offset-4 hover:underline focus-visible:ring-2",
                  )
                : null}
            </nav>
          ) : null}
        </footer>
      </article>
    </div>
  );
}
