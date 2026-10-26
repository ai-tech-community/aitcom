"use client";

import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { SectionLabel } from "@/components/ui/section-label";

import { ItemDragPreview, ItemRow, type ItemRowView } from "./item-row";

/** Where focus goes after a row is removed: a row's ⋯ button, or the empty text. */
type FocusTarget = { key: string } | "empty";

/**
 * The issue's items in order. Reorder by dragging the handle (pointer or
 * keyboard: Space, arrows, Space) or from each row's ⋯ menu. The list only
 * reports moves and removals; the builder owns the order.
 *
 * A removed row takes its ⋯ button with it, so the list owns focus after a
 * removal (WCAG 2.4.3): the next row's ⋯ button, else the previous one's,
 * else the empty-list text. Focus never drops to the page.
 */
export function ItemsList({
  rows,
  onMove,
  onRemove,
}: {
  rows: ItemRowView[];
  onMove: (from: number, to: number) => void;
  onRemove: (key: string) => void;
}) {
  const t = useTranslations("magazineEditor.builder.items");
  const labelId = useId();
  const [activeKey, setActiveKey] = useState<UniqueIdentifier | null>(null);
  const menuTriggers = useRef(new Map<string, HTMLButtonElement>());
  const emptyRef = useRef<HTMLParagraphElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);

  // After the builder drops the removed row, move focus where it was asked.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === "empty") emptyRef.current?.focus();
    else menuTriggers.current.get(target.key)?.focus();
  }, [rows]);

  const remove = (index: number) => {
    const next = rows[index + 1] ?? rows[index - 1];
    pendingFocus.current = next ? { key: next.key } : "empty";
    onRemove(rows[index]!.key);
  };

  const triggerRef = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) menuTriggers.current.set(key, el);
    else menuTriggers.current.delete(key);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const indexOf = (id: UniqueIdentifier) => rows.findIndex((r) => r.key === id);
  const titleOf = (id: UniqueIdentifier) =>
    rows[indexOf(id)]?.title ?? t("article");
  const positionOf = (id: UniqueIdentifier) => ({
    position: indexOf(id) + 1,
    total: rows.length,
  });

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t("announce.pickedUp", { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("announce.movedTo", {
            title: titleOf(active.id),
            ...positionOf(over.id),
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("announce.dropped", {
            title: titleOf(active.id),
            ...positionOf(over.id),
          })
        : t("announce.cancelled", { title: titleOf(active.id) }),
    onDragCancel: ({ active }) =>
      t("announce.cancelled", { title: titleOf(active.id) }),
  };
  const screenReaderInstructions: ScreenReaderInstructions = {
    draggable: t("announce.instructions"),
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveKey(null);
    if (!over || active.id === over.id) return;
    const from = indexOf(active.id);
    const to = indexOf(over.id);
    if (from !== -1 && to !== -1) onMove(from, to);
  };

  const dragged = activeKey === null ? null : rows[indexOf(activeKey)];

  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-3">
      <SectionLabel id={labelId}>{t("label")}</SectionLabel>
      {rows.length === 0 ? (
        <p
          ref={emptyRef}
          tabIndex={-1}
          className="text-muted-foreground rounded-sm text-sm outline-none"
        >
          {t("empty")}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setActiveKey(active.id)}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveKey(null)}
          accessibility={{ announcements, screenReaderInstructions }}
        >
          <SortableContext
            items={rows.map((r) => r.key)}
            strategy={verticalListSortingStrategy}
          >
            <ol aria-labelledby={labelId} className="flex flex-col gap-1.5">
              {rows.map((row, index) => (
                <ItemRow
                  key={row.key}
                  view={row}
                  position={index + 1}
                  total={rows.length}
                  actions={{
                    canMoveUp: index > 0,
                    canMoveDown: index < rows.length - 1,
                    onMove: (delta) => onMove(index, index + delta),
                    onRemove: () => remove(index),
                  }}
                  menuTriggerRef={triggerRef(row.key)}
                />
              ))}
            </ol>
          </SortableContext>
          <DragOverlay>
            {dragged ? <ItemDragPreview view={dragged} /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </section>
  );
}
