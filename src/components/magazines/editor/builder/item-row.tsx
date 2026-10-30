"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  ExternalLink,
  GripVertical,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type Ref, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import type { SuggestionReason } from "@/lib/magazines/suggestions";
import { cn } from "@/lib/utils";

import { SuggestionReasonText } from "../suggestion-reason";

/** What one row of the item list shows. */
export type ItemRowView = {
  key: string;
  /** The item's name in the list: an article title, a block heading. */
  title: string;
  /** The item's kind in plain words ("Article", "Text section"). */
  kindLabel: string;
  reason: SuggestionReason | null;
  /** Editors only: the saved item's content cannot be shown to readers. */
  unavailable: boolean;
  /** Why the item stops a save or a publish, in friendly words; null when nothing does. */
  problem: string | null;
  /** The row a refused save pointed at. */
  highlighted: boolean;
  /** Opens the item's editor; absent for kinds without one (articles). */
  onEdit?: () => void;
  /** The row edit button, where Done returns keyboard focus. */
  editButtonRef?: Ref<HTMLButtonElement>;
  /**
   * Opens the content the item references in its own editor (an article
   * in the article editor), when the viewer may edit it.
   */
  open?: { href: string; label: string };
  selected: boolean;
  membersOnly: boolean;
};

export type ItemRowActions = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: -1 | 1) => void;
  /**
   * Removes the row. The row unmounts, so the list moves focus on (the
   * menu does not return it to a trigger that is gone).
   */
  onRemove: () => void;
};

/**
 * One issue item in the builder's list: a drag handle (pointer and
 * keyboard), the item's name, its problem or unavailable marker, and a ⋯
 * menu with Move up / Move down / Remove so reordering also works from a
 * menu on touch screens and for keyboard users who prefer it.
 */
export function ItemRow({
  view,
  position,
  total,
  actions,
  menuTriggerRef,
}: {
  view: ItemRowView;
  position: number;
  total: number;
  actions: ItemRowActions;
  /** The row's ⋯ button, where the list puts focus after a removal. */
  menuTriggerRef?: Ref<HTMLButtonElement>;
}) {
  const t = useTranslations("magazineEditor.builder.items");
  const problemId = useId();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: view.key });
  // The problem is read with every control of the row, since a list item
  // cannot take focus and its description would never be heard.
  const describedBy = (...ids: (string | undefined)[]) =>
    [...ids, view.problem ? problemId : undefined].filter(Boolean).join(" ") ||
    undefined;

  const label = (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm font-medium">{view.title}</span>
      {view.reason && (
        <span className="text-muted-foreground text-xs break-words">
          {t("pickedBecause")} <SuggestionReasonText reason={view.reason} />
        </span>
      )}
      <span className="text-muted-foreground text-xs">
        {view.kindLabel}
        {view.unavailable && <> · {t("unavailable")}</>}
        {view.membersOnly && <> · {t("membersOnly")}</>}
      </span>
    </span>
  );

  return (
    <li
      ref={setNodeRef}
      data-testid={`issue-item-${view.key}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "bg-background flex flex-col gap-1 rounded-md border px-1.5 py-1.5",
        view.selected && "bg-muted",
        (view.highlighted || view.problem) && "border-destructive",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-center gap-1">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-describedby={describedBy(attributes["aria-describedby"])}
          aria-label={t("dragHandle", { title: view.title })}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm outline-none focus-visible:ring-[3px] active:cursor-grabbing"
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
        <span
          aria-hidden="true"
          className="text-muted-foreground w-5 shrink-0 text-right font-mono text-xs tabular-nums"
        >
          {position}
        </span>
        <span className="sr-only">{t("position", { position, total })}</span>
        {view.onEdit ? (
          <button
            type="button"
            ref={view.editButtonRef}
            onClick={view.onEdit}
            aria-current={view.selected ? "true" : undefined}
            aria-describedby={describedBy()}
            className="focus-visible:ring-ring/50 hover:bg-secondary/50 flex min-w-0 flex-1 rounded-sm px-1.5 py-0.5 text-left outline-none focus-visible:ring-[3px]"
          >
            {label}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 px-1.5 py-0.5">{label}</div>
        )}
        <RowMenu
          title={view.title}
          open={view.open}
          actions={actions}
          triggerRef={menuTriggerRef}
          describedBy={describedBy()}
        />
      </div>
      {view.problem && (
        <p
          id={problemId}
          className="text-destructive flex items-start gap-1.5 px-1.5 pb-0.5 text-xs"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {view.problem}
        </p>
      )}
    </li>
  );
}

function RowMenu({
  title,
  open,
  actions,
  triggerRef,
  describedBy,
}: {
  title: string;
  open: ItemRowView["open"];
  actions: ItemRowActions;
  triggerRef?: Ref<HTMLButtonElement>;
  /** The row's problem, read with the ⋯ button. */
  describedBy?: string;
}) {
  const t = useTranslations("magazineEditor.builder.items");
  const removing = useRef(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon"
          aria-label={t("actions", { title })}
          aria-describedby={describedBy}
          className="size-8 shrink-0"
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          // The row is gone: the list has already moved focus on.
          if (removing.current) event.preventDefault();
        }}
      >
        {open && (
          <>
            <DropdownMenuItem asChild>
              <Link href={open.href} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" />
                {open.label}
                <span className="sr-only"> {t("opensInNewTab")}</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
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
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            removing.current = true;
            actions.onRemove();
          }}
        >
          <Trash2 aria-hidden="true" />
          {t("remove")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What follows the pointer while an item is dragged. */
export function ItemDragPreview({ view }: { view: ItemRowView }) {
  return (
    <div className="bg-background flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm shadow-md">
      <GripVertical
        aria-hidden="true"
        className="text-muted-foreground size-4"
      />
      <span className="truncate font-medium">{view.title}</span>
    </div>
  );
}
