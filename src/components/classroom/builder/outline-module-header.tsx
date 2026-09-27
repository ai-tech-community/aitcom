"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  NotebookPen,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ModuleHeaderActions = {
  /** Resolve once the saved value is back from the server (or the save failed). */
  onRename: (title: string) => Promise<void>;
  onSaveSummary: (summary: string | null) => Promise<void>;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
};

/**
 * A module's title (renamed in place), its optional summary, and its ⋯ menu.
 * `startEditing` opens the title for renaming on mount — used for a module the
 * author has just added.
 */
export function OutlineModuleHeader({
  moduleId,
  title: savedTitle,
  summary: savedSummary,
  canMoveUp,
  canMoveDown,
  lessonCount,
  readOnly,
  startEditing,
  onEditingDone,
  actions,
}: {
  moduleId: number;
  title: string;
  summary: string | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  lessonCount: number;
  readOnly: boolean;
  startEditing: boolean;
  onEditingDone: () => void;
  actions: ModuleHeaderActions;
}) {
  const [editingTitle, setEditingTitle] = useState(startEditing && !readOnly);
  const [editingSummary, setEditingSummary] = useState(false);
  // What the author just saved, shown until the server's copy arrives, so the
  // old value never flashes back in between.
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const [pendingSummary, setPendingSummary] = useState<{
    value: string | null;
  } | null>(null);
  const title = pendingTitle ?? savedTitle;
  const summary = pendingSummary ? pendingSummary.value : savedSummary;

  const finishTitle = (next: string | null) => {
    setEditingTitle(false);
    onEditingDone();
    const trimmed = next?.trim();
    if (!trimmed || trimmed === title) return;
    setPendingTitle(trimmed);
    void actions.onRename(trimmed).finally(() => setPendingTitle(null));
  };

  const saveSummary = (next: string) => {
    setEditingSummary(false);
    const value = next.trim() === "" ? null : next.trim();
    if (value === summary) return;
    setPendingSummary({ value });
    void actions.onSaveSummary(value).finally(() => setPendingSummary(null));
  };

  return (
    <div data-testid={`outline-module-${moduleId}`} className="space-y-1">
      <div className="flex min-h-8 items-center gap-1">
        {editingTitle ? (
          <TitleInput initial={title} onDone={finishTitle} />
        ) : readOnly ? (
          <p className="min-w-0 flex-1 truncate px-2 text-sm font-semibold">
            {title}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            className="hover:bg-secondary/50 focus-visible:ring-ring/50 min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-sm font-semibold outline-none focus-visible:ring-[3px]"
          >
            {title}
          </button>
        )}
        {readOnly ? null : (
          <ModuleMenu
            hasSummary={!!summary}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            lessonCount={lessonCount}
            onEditSummary={() => setEditingSummary(true)}
            actions={actions}
          />
        )}
      </div>

      {editingSummary ? (
        <SummaryEditor
          initial={summary ?? ""}
          onCancel={() => setEditingSummary(false)}
          onSave={saveSummary}
        />
      ) : summary ? (
        <p className="text-muted-foreground line-clamp-2 px-2 text-xs">
          {summary}
        </p>
      ) : null}
    </div>
  );
}

/** Enter or leaving the field saves; Escape cancels. Settles exactly once. */
function TitleInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (value: string | null) => void;
}) {
  const t = useTranslations("classroomBuilder");
  const [value, setValue] = useState(initial);
  const settled = useRef(false);
  const settle = (next: string | null) => {
    if (settled.current) return;
    settled.current = true;
    onDone(next);
  };
  return (
    <Input
      autoFocus
      value={value}
      maxLength={200}
      aria-label={t("moduleTitle")}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => settle(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          settle(value);
        } else if (e.key === "Escape") {
          e.stopPropagation();
          settle(null);
        }
      }}
      className="h-8 text-sm font-semibold"
    />
  );
}

function SummaryEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("classroomBuilder");
  const id = useId();
  const [value, setValue] = useState(initial);
  return (
    <div className="space-y-2 px-2">
      <label htmlFor={id} className="sr-only">
        {t("moduleSummary")}
      </label>
      <Textarea
        id={id}
        autoFocus
        rows={2}
        maxLength={500}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave(value);
          }
        }}
        className="min-h-14 text-xs"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("cancelSummary")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSave(value)}
        >
          {t("saveSummary")}
        </Button>
      </div>
    </div>
  );
}

function ModuleMenu({
  hasSummary,
  canMoveUp,
  canMoveDown,
  lessonCount,
  onEditSummary,
  actions,
}: {
  hasSummary: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  lessonCount: number;
  onEditSummary: () => void;
  actions: ModuleHeaderActions;
}) {
  const t = useTranslations("classroomBuilder");
  const notEmpty = lessonCount > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("moduleActions")}
          className="size-7 shrink-0"
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-64">
        <DropdownMenuItem onSelect={onEditSummary}>
          <NotebookPen aria-hidden="true" />
          {hasSummary ? t("editModuleSummary") : t("addModuleSummary")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canMoveUp}
          onSelect={() => actions.onMove(-1)}
        >
          <ArrowUp aria-hidden="true" />
          {t("moveModuleUp")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canMoveDown}
          onSelect={() => actions.onMove(1)}
        >
          <ArrowDown aria-hidden="true" />
          {t("moveModuleDown")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* A disabled menu item can't show a hover tooltip, so the reason is written in the item. */}
        <DropdownMenuItem
          variant="destructive"
          disabled={notEmpty}
          onSelect={actions.onDelete}
          className="items-start"
        >
          <Trash2 aria-hidden="true" className="mt-0.5" />
          <span className="flex flex-col gap-0.5">
            <span>{t("deleteModule")}</span>
            {notEmpty ? (
              <span className="text-muted-foreground text-xs">
                {t("errorModuleNotEmpty")}
              </span>
            ) : null}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
