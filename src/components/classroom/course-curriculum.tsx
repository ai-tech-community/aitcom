import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronRight, FileText, Lock } from "lucide-react";
import type { ModuleRef } from "@/lib/classroom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type CurriculumLesson = { id: number; title: string };
export type CurriculumGroup = {
  module: ModuleRef | null;
  lessons: CurriculumLesson[];
};

export type CurriculumLinkRenderer = (
  lesson: CurriculumLesson,
  props: { className: string; "aria-current"?: "step"; children: ReactNode },
) => ReactNode;

export type LessonLinkRenderer = (
  lesson: CurriculumLesson | undefined,
  children: ReactNode,
  className?: string,
  current?: "step",
) => ReactNode;

/** The same reading order and status vocabulary in the overview, rail and sheet. */
export function CourseCurriculum({
  groups,
  completed,
  selectedId,
  nextLessonId,
  compact = false,
  tracking = false,
  renderLink,
}: {
  groups: CurriculumGroup[];
  completed: ReadonlySet<number>;
  selectedId?: number;
  nextLessonId?: number;
  compact?: boolean;
  tracking?: boolean;
  renderLink?: CurriculumLinkRenderer;
}) {
  const t = useTranslations("redesign.classroom");
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = rail.current;
    const current = container?.querySelector('[aria-current="step"]');
    if (!container || !current) return;
    const containerBox = container.getBoundingClientRect();
    const row = current.getBoundingClientRect();
    if (row.top < containerBox.top) {
      container.scrollTop += row.top - containerBox.top - 8;
    } else if (row.bottom > containerBox.bottom) {
      container.scrollTop += row.bottom - containerBox.bottom + 8;
    }
  }, [selectedId]);

  return (
    <div
      ref={rail}
      className={cn(
        "space-y-5",
        compact &&
          "min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]",
      )}
    >
      {groups.map(({ module, lessons }) => {
        const moduleComplete = lessons.filter((lesson) =>
          completed.has(lesson.id),
        ).length;
        return (
          <section key={module?.id ?? "flat"}>
            {module ? (
              <div className={cn("space-y-2 pb-2", compact && "px-1")}>
                {module.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- module images can use author upload hosts
                  <img
                    src={module.imageUrl}
                    alt={module.imageAlt ?? ""}
                    className="bg-muted aspect-[3/1] w-full rounded-lg object-cover"
                  />
                ) : null}
                <div className="flex items-baseline justify-between gap-3">
                  <h3
                    className={cn(
                      "min-w-0 font-semibold [overflow-wrap:anywhere]",
                      compact ? "text-sm" : "text-base",
                    )}
                  >
                    {module.title}
                  </h3>
                  {tracking ? (
                    <span
                      aria-label={t("lessonsComplete", {
                        completed: moduleComplete,
                        total: lessons.length,
                      })}
                      className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums"
                    >
                      {moduleComplete}/{lessons.length}
                    </span>
                  ) : (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {t("lessonCount", { count: lessons.length })}
                    </span>
                  )}
                </div>
                {module.summary ? (
                  <p className="text-muted-foreground text-sm [overflow-wrap:anywhere]">
                    {module.summary}
                  </p>
                ) : null}
              </div>
            ) : null}
            {lessons.length === 0 ? (
              <p className="text-muted-foreground px-1 pb-2 text-sm">
                {t("emptyModule")}
              </p>
            ) : (
              <ol
                className={cn(
                  "border-border divide-border divide-y border-t border-b",
                  compact && "border-b-0",
                )}
              >
                {lessons.map((lesson) => {
                  const done = tracking && completed.has(lesson.id);
                  const current = selectedId === lesson.id;
                  const upNext = nextLessonId === lesson.id;
                  const Icon = done ? Check : renderLink ? FileText : Lock;
                  const row = (
                    <>
                      <Icon
                        aria-hidden="true"
                        className="text-muted-foreground size-4 shrink-0"
                      />
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                        {lesson.title}
                      </span>
                      {done ? (
                        <span className="sr-only">{t("lessonCompleted")}</span>
                      ) : null}
                      {upNext ? (
                        <Badge
                          variant="outline"
                          className="bg-background shrink-0 font-medium"
                        >
                          {t("nextLessonTag")}
                        </Badge>
                      ) : null}
                      {renderLink && !compact ? (
                        <ChevronRight
                          aria-hidden="true"
                          className="text-muted-foreground size-4 shrink-0"
                        />
                      ) : null}
                    </>
                  );
                  const className = cn(
                    "flex min-h-11 w-full items-center gap-2.5 px-2 py-2 text-left text-sm",
                    renderLink
                      ? "hover:bg-muted focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset"
                      : "text-muted-foreground",
                    (current || upNext) && "bg-muted font-semibold",
                  );
                  return (
                    <li key={lesson.id}>
                      {renderLink ? (
                        renderLink(lesson, {
                          className,
                          "aria-current": current ? "step" : undefined,
                          children: row,
                        })
                      ) : (
                        <div className={className}>{row}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
