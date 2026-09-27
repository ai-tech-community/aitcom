"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  applyLessonMove,
  findLesson,
  type LessonMove,
  type OutlineGroup,
} from "./outline-model";

/** The droppable id of a group: its SortableContext, and an empty module's drop zone. */
export function groupDropId(moduleId: number | null) {
  return `group:${moduleId ?? "flat"}`;
}

/** Where a drag target sits: a lesson (with its index) or a whole group (index null). */
function locate(groups: OutlineGroup[], id: UniqueIdentifier) {
  if (typeof id === "number") return findLesson(groups, id);
  const groupIndex = groups.findIndex((g) => groupDropId(g.moduleId) === id);
  return groupIndex === -1 ? null : { groupIndex, index: null };
}

/**
 * Drag and drop for outline lessons. While dragging, a lesson that crosses into
 * another group moves there in the local order (so the rows make room for it);
 * nothing is saved until the drop. On drop, the result is compared with the
 * order at pick-up: unchanged → nothing is sent; changed → `onCommit` gets the
 * new groups, the target container's full order, and the pick-up order to fall
 * back to.
 */
export function useLessonDrag({
  groups,
  setGroups,
  hold,
  titleOf,
  onCommit,
}: {
  groups: OutlineGroup[];
  setGroups: (groups: OutlineGroup[]) => void;
  /** Pauses syncing from the server; returns the release. */
  hold: () => () => void;
  titleOf: (lessonId: number) => string;
  onCommit: (
    result: { groups: OutlineGroup[]; move: LessonMove },
    previous: OutlineGroup[],
  ) => void;
}) {
  const t = useTranslations("classroomBuilder");
  const [activeId, setActiveId] = useState<number | null>(null);
  const pickUp = useRef<{ groups: OutlineGroup[]; release: () => void } | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const finish = () => {
    const started = pickUp.current;
    pickUp.current = null;
    setActiveId(null);
    started?.release();
    return started?.groups ?? null;
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    pickUp.current = { groups, release: hold() };
    setActiveId(active.id as number);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const lessonId = active.id as number;
    const from = findLesson(groups, lessonId);
    const to = locate(groups, over.id);
    if (!from || !to || from.groupIndex === to.groupIndex) return;
    const target = groups[to.groupIndex]!;
    let index = to.index ?? target.lessonIds.length;
    // Entering from below a row lands after it, not before it.
    const dragged = active.rect.current.translated;
    if (
      to.index !== null &&
      dragged &&
      dragged.top > over.rect.top + over.rect.height / 2
    )
      index += 1;
    const moved = applyLessonMove(groups, lessonId, {
      moduleId: target.moduleId,
      index,
    });
    if (moved) setGroups(moved.groups);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const start = finish();
    if (!start) return;
    const lessonId = active.id as number;
    if (!over) {
      setGroups(start);
      return;
    }
    // The last step inside the landing group (cross-group steps already happened in onDragOver).
    let current = groups;
    const from = findLesson(current, lessonId);
    const to = locate(current, over.id);
    if (from && to?.groupIndex === from.groupIndex && to.index !== null) {
      const group = current[from.groupIndex]!;
      current =
        applyLessonMove(current, lessonId, {
          moduleId: group.moduleId,
          index: to.index,
        })?.groups ?? current;
    }

    const before = findLesson(start, lessonId);
    const after = findLesson(current, lessonId);
    if (!before || !after) {
      setGroups(start);
      return;
    }
    const landed = current[after.groupIndex]!;
    const unchanged =
      start[before.groupIndex]!.moduleId === landed.moduleId &&
      before.index === after.index;
    if (unchanged) {
      setGroups(start);
      return;
    }
    onCommit(
      {
        groups: current,
        move: { moduleId: landed.moduleId, orderedIds: [...landed.lessonIds] },
      },
      start,
    );
  };

  const onDragCancel = () => {
    const start = finish();
    if (start) setGroups(start);
  };

  const groupName = (groupIndex: number | undefined) =>
    (groupIndex === undefined ? null : groups[groupIndex]?.title) ??
    t("outline");
  const targetName = (id: UniqueIdentifier) =>
    typeof id === "number"
      ? titleOf(id)
      : groupName(locate(groups, id)?.groupIndex);
  const lessonTitle = (id: UniqueIdentifier) => titleOf(id as number);

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t("dragStart", { title: lessonTitle(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("dragOver", {
            title: lessonTitle(active.id),
            target: targetName(over.id),
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("dragEnd", {
            title: lessonTitle(active.id),
            target: groupName(
              findLesson(groups, active.id as number)?.groupIndex,
            ),
          })
        : t("dragCancel", { title: lessonTitle(active.id) }),
    onDragCancel: ({ active }) =>
      t("dragCancel", { title: lessonTitle(active.id) }),
  };
  const screenReaderInstructions: ScreenReaderInstructions = {
    draggable: t("dragInstructions"),
  };

  return {
    activeId,
    contextProps: {
      sensors,
      onDragStart,
      onDragOver,
      onDragEnd,
      onDragCancel,
      accessibility: { announcements, screenReaderInstructions },
    },
  };
}
