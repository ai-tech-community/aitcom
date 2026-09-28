"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { MoreHorizontal, Plus, Ungroup } from "lucide-react";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import {
  lessonHasContent,
  type ChecklistLesson,
} from "@/lib/classroom/publish-checklist";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BuilderSelection } from "./course-builder";
import { builderErrorKey } from "./builder-errors";
import {
  applyLessonMove,
  buildOutline,
  moveByStep,
  nextModuleTitle,
  readingOrder,
  type LessonMove,
  type OutlineGroup,
  type OutlineLesson,
  type OutlineModule,
} from "./outline-model";
import { AddLessonRow } from "./add-lesson-row";
import type { RewriteLessons } from "./lesson-versions";
import { OutlineModuleHeader } from "./outline-module-header";
import {
  ActiveMarker,
  LessonDragPreview,
  OutlineLessonRow,
  outlineRowClass,
  type OutlineLessonView,
} from "./outline-lesson-row";
import { groupDropId, useLessonDrag } from "./use-lesson-drag";

export type CourseOutlineLesson = OutlineLesson &
  Pick<ChecklistLesson, "body" | "resources" | "examQuestions">;

type MoveResult = { groups: OutlineGroup[]; move: LessonMove };

/**
 * The outline shows the server's order, except while the author's own change
 * is in flight (a drag, or a reorder the server has not answered yet): then
 * it shows the local order and ignores server data until every hold is
 * released, so a refetch can't snap a row back mid-move.
 *
 * `resyncWhenFree` marks the local order as untrusted (a move failed while
 * another was still pending): once every hold is released, the outline takes
 * the server's order even if the server data object has not changed.
 */
function useOptimisticGroups(serverGroups: OutlineGroup[]) {
  const [groups, setGroups] = useState(serverGroups);
  const [basis, setBasis] = useState(serverGroups);
  const [holds, setHolds] = useState(0);
  const [stale, setStale] = useState(false);
  if (holds === 0 && (stale || basis !== serverGroups)) {
    setStale(false);
    setBasis(serverGroups);
    setGroups(serverGroups);
  }
  const hold = useCallback(() => {
    setHolds((h) => h + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setHolds((h) => h - 1);
    };
  }, []);
  const resyncWhenFree = useCallback(() => setStale(true), []);
  return { groups, setGroups, hold, resyncWhenFree };
}

function errorCode(err: unknown) {
  return err instanceof Error ? err.message : undefined;
}

/**
 * The builder's left pane: course details, then modules → lessons. Authors
 * reorder by drag and drop (pointer or keyboard) or from each row's ⋯ menu,
 * add lessons by typing a title and pressing Enter, and delete after a
 * confirm. Every change is saved straight away.
 */
export function CourseOutline({
  courseId,
  lessons,
  modules,
  selection,
  onSelect,
  onLessonDeleted,
  rewriteLessons,
  readOnly,
}: {
  courseId: number;
  lessons: CourseOutlineLesson[];
  modules: OutlineModule[];
  selection: BuilderSelection;
  onSelect: (s: BuilderSelection) => void;
  /** Told first when a lesson is deleted, before any selection change. */
  onLessonDeleted?: (lessonId: number) => void;
  /**
   * Every write that rewrites lessons (a reorder, the first module's wrap,
   * removing modules) goes through here, so an open lesson keeps saving on
   * the version the server gave it (see lesson-versions.ts).
   */
  rewriteLessons: RewriteLessons;
  readOnly: boolean;
}) {
  const t = useTranslations("classroomBuilder");
  const confirm = useConfirm();
  const utils = api.useUtils();
  const reorderLessons = api.classrooms.reorderLessons.useMutation();
  const addLesson = api.classrooms.addLesson.useMutation();
  const deleteLesson = api.classrooms.deleteLesson.useMutation();
  const addModule = api.classrooms.addModule.useMutation();
  const renameModule = api.classrooms.renameModule.useMutation();
  const reorderModules = api.classrooms.reorderModules.useMutation();
  const deleteModule = api.classrooms.deleteModule.useMutation();
  const dissolveModules = api.classrooms.dissolveModules.useMutation();

  const serverGroups = useMemo(
    () => buildOutline(lessons, modules),
    [lessons, modules],
  );
  const { groups, setGroups, hold, resyncWhenFree } =
    useOptimisticGroups(serverGroups);
  const lessonById = useMemo(
    () => new Map(lessons.map((l) => [l.id, l])),
    [lessons],
  );
  const moduled = modules.length > 0;
  // A module the author just added opens with its title ready to rename.
  const [renamingModuleId, setRenamingModuleId] = useState<number | null>(null);

  // Read when a delete finishes, which may be after the selection changed.
  const selectionRef = useRef(selection);
  useEffect(() => {
    selectionRef.current = selection;
  });

  const refresh = () => void utils.classrooms.get.invalidate();
  const fail = (err: unknown) =>
    toast.error(t(builderErrorKey(errorCode(err))));
  /**
   * Every write goes through mutateAsync: TanStack Query keeps per-call
   * `mutate` callbacks only for the latest call on an observer, so an
   * overlapping second call would silently drop the first one's handlers.
   */
  const run = async (write: () => Promise<unknown>) => {
    try {
      await write();
      refresh();
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  };

  // Numbers each move so a failure knows whether a later move is on screen.
  const lastMove = useRef(0);
  const commitMove = async (
    result: MoveResult,
    previous: OutlineGroup[] = groups,
  ) => {
    const release = hold();
    const ticket = ++lastMove.current;
    setGroups(result.groups);
    try {
      await rewriteLessons(() =>
        reorderLessons.mutateAsync({ courseId, ...result.move }),
      );
    } catch (err) {
      fail(err);
      // Put the old order back only if nothing newer is showing; otherwise
      // `previous` would wipe the later move. Either way, the server's order
      // wins once every pending move has settled.
      if (ticket === lastMove.current) setGroups(previous);
      resyncWhenFree();
    } finally {
      release();
      refresh();
    }
  };

  const drag = useLessonDrag({
    groups,
    setGroups,
    hold,
    titleOf: (id) => lessonById.get(id)?.title ?? "",
    onCommit: (result, previous) => void commitMove(result, previous),
  });

  const numbers = new Map(readingOrder(groups).map((id, i) => [id, i + 1]));
  const viewOf = (id: number): OutlineLessonView | null => {
    const lesson = lessonById.get(id);
    if (!lesson) return null;
    return {
      id,
      number: numbers.get(id) ?? 0,
      title: lesson.title,
      hasQuiz:
        Array.isArray(lesson.examQuestions) && lesson.examQuestions.length > 0,
      empty: !lessonHasContent(lesson),
    };
  };

  const removeLesson = async (lessonId: number) => {
    const ok = await confirm({
      description: t("deleteLessonConfirm", {
        title: lessonById.get(lessonId)?.title ?? "",
      }),
      confirmLabel: t("deleteLesson"),
      destructive: true,
    });
    if (!ok) return;
    const order = readingOrder(groups);
    if (!(await run(() => deleteLesson.mutateAsync({ lessonId })))) return;
    onLessonDeleted?.(lessonId);
    const current = selectionRef.current;
    if (current.kind === "lesson" && current.lessonId === lessonId) {
      const next = order[order.indexOf(lessonId) + 1];
      onSelect(
        next === undefined
          ? { kind: "details" }
          : { kind: "lesson", lessonId: next },
      );
    }
  };

  const addLessonTo = (moduleId: number | null, title: string) =>
    run(() =>
      addLesson.mutateAsync(
        moduleId === null ? { courseId, title } : { courseId, title, moduleId },
      ),
    );

  const moveModule = (moduleId: number, delta: -1 | 1) => {
    const ids = groups
      .map((g) => g.moduleId)
      .filter((id): id is number => id !== null);
    const from = ids.indexOf(moduleId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    void run(() => reorderModules.mutateAsync({ courseId, orderedIds: ids }));
  };

  const removeModule = async (moduleId: number, title: string) => {
    const ok = await confirm({
      description: t("deleteModuleConfirm", { title }),
      confirmLabel: t("deleteModule"),
      destructive: true,
    });
    if (ok) await run(() => deleteModule.mutateAsync({ moduleId }));
  };

  const createModule = async () => {
    const title = nextModuleTitle(
      t("moduleLabel"),
      modules.map((mod) => mod.title),
    );
    await run(async () => {
      const { id } = await rewriteLessons(() =>
        addModule.mutateAsync({ courseId, title }),
      );
      setRenamingModuleId(id);
    });
  };

  const removeModules = async () => {
    const ok = await confirm({
      description: t("removeModulesConfirm"),
      confirmLabel: t("removeModules"),
      destructive: true,
    });
    if (ok) {
      await run(() =>
        rewriteLessons(() => dissolveModules.mutateAsync({ courseId })),
      );
    }
  };

  /** Resolves after the server's copy is back, so the header can stop showing its local value. */
  const saveModule = async (
    input: { moduleId: number } & (
      | { title: string }
      | { summary: string | null }
    ),
  ) => {
    try {
      await renameModule.mutateAsync(input);
      await utils.classrooms.get.invalidate();
    } catch (err) {
      fail(err);
    }
  };

  const moduleActions = (moduleId: number, title: string) => ({
    onRename: (next: string) => saveModule({ moduleId, title: next }),
    onSaveSummary: (summary: string | null) =>
      saveModule({ moduleId, summary }),
    onMove: (delta: -1 | 1) => moveModule(moduleId, delta),
    onDelete: () => void removeModule(moduleId, title),
  });

  const moduleTargets = groups.flatMap((g) =>
    g.moduleId === null ? [] : [{ moduleId: g.moduleId, title: g.title ?? "" }],
  );
  const hasLessons = lessons.length > 0;
  const dragged = drag.activeId === null ? null : viewOf(drag.activeId);

  return (
    <div className="space-y-4 p-3">
      <div className="flex">
        <button
          type="button"
          aria-current={selection.kind === "details" ? "true" : undefined}
          onClick={() => onSelect({ kind: "details" })}
          className={outlineRowClass(selection.kind === "details")}
        >
          <ActiveMarker active={selection.kind === "details"} />
          {t("courseDetails")}
        </button>
      </div>

      <DndContext collisionDetection={closestCorners} {...drag.contextProps}>
        {groups.map((group, groupIndex) => (
          <section
            key={groupDropId(group.moduleId)}
            data-testid={`outline-group-${group.moduleId ?? "flat"}`}
            className="space-y-1"
          >
            {group.moduleId === null ? null : (
              <OutlineModuleHeader
                moduleId={group.moduleId}
                title={group.title ?? ""}
                summary={group.summary}
                canMoveUp={groupIndex > 0}
                canMoveDown={groupIndex < groups.length - 1}
                lessonCount={group.lessonIds.length}
                readOnly={readOnly}
                startEditing={renamingModuleId === group.moduleId}
                onEditingDone={() => setRenamingModuleId(null)}
                actions={moduleActions(group.moduleId, group.title ?? "")}
              />
            )}

            <SortableContext
              id={groupDropId(group.moduleId)}
              items={group.lessonIds}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-0.5">
                {group.lessonIds.map((id) => {
                  const view = viewOf(id);
                  if (!view) return null;
                  return (
                    <OutlineLessonRow
                      key={id}
                      lesson={view}
                      active={
                        selection.kind === "lesson" && selection.lessonId === id
                      }
                      readOnly={readOnly}
                      onSelect={() =>
                        onSelect({ kind: "lesson", lessonId: id })
                      }
                      actions={{
                        canMoveUp: moveByStep(groups, id, -1) !== null,
                        canMoveDown: moveByStep(groups, id, 1) !== null,
                        onMove: (delta) => {
                          const moved = moveByStep(groups, id, delta);
                          if (moved) void commitMove(moved);
                        },
                        moveTargets: moduleTargets.filter(
                          (m) => m.moduleId !== group.moduleId,
                        ),
                        onMoveToModule: (moduleId) => {
                          const target = groups.find(
                            (g) => g.moduleId === moduleId,
                          );
                          const moved =
                            target &&
                            applyLessonMove(groups, id, {
                              moduleId,
                              index: target.lessonIds.length,
                            });
                          if (moved) void commitMove(moved);
                        },
                        onDelete: () => void removeLesson(id),
                      }}
                    />
                  );
                })}
              </ul>
            </SortableContext>

            {group.lessonIds.length === 0 &&
            group.moduleId !== null &&
            !readOnly ? (
              <EmptyModuleDrop id={groupDropId(group.moduleId)} />
            ) : null}
            {group.moduleId === null && !hasLessons ? (
              <p className="text-muted-foreground px-2 text-sm">
                {readOnly ? t("noLessons") : t("emptyCourseHint")}
              </p>
            ) : null}
            {readOnly ? null : (
              <AddLessonRow
                moduleTitle={group.title}
                onAdd={(title) => addLessonTo(group.moduleId, title)}
              />
            )}
          </section>
        ))}

        <DragOverlay>
          {dragged ? <LessonDragPreview lesson={dragged} /> : null}
        </DragOverlay>
      </DndContext>

      {readOnly ? null : (
        <div className="border-border flex items-center gap-1 border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={addModule.isPending}
            onClick={() => void createModule()}
            className="text-muted-foreground hover:text-foreground flex-1 justify-start"
          >
            <Plus aria-hidden="true" />
            {!moduled && hasLessons ? t("groupIntoModules") : t("addModule")}
          </Button>
          {moduled ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("outlineActions")}
                  className="size-8"
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void removeModules()}>
                  <Ungroup aria-hidden="true" />
                  {t("removeModules")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Lets an empty module take a dragged lesson. */
function EmptyModuleDrop({ id }: { id: string }) {
  const t = useTranslations("classroomBuilder");
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "text-muted-foreground border-border rounded-md border border-dashed px-2 py-2 text-xs",
        isOver && "border-foreground/40 bg-muted",
      )}
    >
      {t("emptyModuleDrop")}
    </div>
  );
}
