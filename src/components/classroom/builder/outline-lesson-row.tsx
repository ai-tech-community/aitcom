"use client";

import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  FolderInput,
  GripVertical,
  ListChecks,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type OutlineLessonView = {
  id: number;
  /** Position in reading order across the whole course, from 1. */
  number: number;
  title: string;
  hasQuiz: boolean;
  empty: boolean;
};

export type LessonRowActions = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: -1 | 1) => void;
  /** The other modules this lesson can move to; empty in a course without modules. */
  moveTargets: { moduleId: number; title: string }[];
  onMoveToModule: (moduleId: number) => void;
  onDelete: () => void;
};

/** Shared by outline rows: `bg-muted` plus the orange marker (a non-colour cue too: weight). */
export function outlineRowClass(active: boolean) {
  return cn(
    "focus-visible:ring-ring/50 relative flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-[3px]",
    active
      ? "bg-muted text-foreground font-medium"
      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
  );
}

export function ActiveMarker({ active }: { active: boolean }) {
  return active ? (
    <span
      aria-hidden="true"
      className="bg-primary absolute top-1/2 left-0 h-4 w-1 -translate-y-1/2 rounded-full"
    />
  ) : null;
}

function LessonLabel({ lesson }: { lesson: OutlineLessonView }) {
  const t = useTranslations("classroomBuilder");
  return (
    <>
      <span
        data-testid="lesson-number"
        className="text-muted-foreground w-5 shrink-0 text-right font-mono text-xs tabular-nums"
      >
        {lesson.number}
      </span>{" "}
      <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
      {lesson.hasQuiz ? (
        <span className="text-muted-foreground shrink-0" title={t("hasQuiz")}>
          <ListChecks aria-hidden="true" className="size-3.5" />
          <span className="sr-only">{t("hasQuiz")}</span>
        </span>
      ) : null}
      {lesson.empty ? (
        <span className="text-muted-foreground border-border shrink-0 rounded-full border px-1.5 text-xs leading-4 font-normal">
          {t("emptyLesson")}
        </span>
      ) : null}
    </>
  );
}

/** One lesson in the outline: drag handle (wide screens), select button, and ⋯ menu. */
export function OutlineLessonRow({
  lesson,
  active,
  readOnly,
  onSelect,
  actions,
}: {
  lesson: OutlineLessonView;
  active: boolean;
  readOnly: boolean;
  onSelect: () => void;
  actions: LessonRowActions;
}) {
  const t = useTranslations("classroomBuilder");
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id, disabled: readOnly });

  return (
    <li
      ref={setNodeRef}
      data-testid={`outline-lesson-${lesson.id}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group/row flex items-center gap-0.5",
        isDragging && "opacity-40",
      )}
    >
      {readOnly ? null : (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("dragHandle", { title: lesson.title })}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 hidden h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm outline-none focus-visible:ring-[3px] active:cursor-grabbing lg:flex"
        >
          <GripVertical aria-hidden="true" className="size-3.5" />
        </button>
      )}

      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onSelect}
        className={outlineRowClass(active)}
      >
        <ActiveMarker active={active} />
        <LessonLabel lesson={lesson} />
      </button>

      {readOnly ? null : <LessonMenu title={lesson.title} actions={actions} />}
    </li>
  );
}

function LessonMenu({
  title,
  actions,
}: {
  title: string;
  actions: LessonRowActions;
}) {
  const t = useTranslations("classroomBuilder");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("lessonActions", { title })}
          className="size-7 shrink-0"
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={!actions.canMoveUp}
          onSelect={() => actions.onMove(-1)}
        >
          <ArrowUp aria-hidden="true" />
          {t("moveUp")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!actions.canMoveDown}
          onSelect={() => actions.onMove(1)}
        >
          <ArrowDown aria-hidden="true" />
          {t("moveDown")}
        </DropdownMenuItem>
        {actions.moveTargets.length > 0 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput aria-hidden="true" />
              {t("moveToModule")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {actions.moveTargets.map((target) => (
                <DropdownMenuItem
                  key={target.moduleId}
                  onSelect={() => actions.onMoveToModule(target.moduleId)}
                >
                  <span className="max-w-56 truncate">{target.title}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={actions.onDelete}>
          <Trash2 aria-hidden="true" />
          {t("deleteLesson")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What follows the pointer while a lesson is dragged. */
export function LessonDragPreview({ lesson }: { lesson: OutlineLessonView }) {
  return (
    <div className="bg-background border-border flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm shadow-md">
      <GripVertical
        aria-hidden="true"
        className="text-muted-foreground size-3.5"
      />
      <LessonLabel lesson={lesson} />
    </div>
  );
}
