"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { stripIncompleteMaterials } from "@/lib/classroom/lesson-body";
import type { ExamQuestion } from "@/lib/classroom";
import { builderErrorKey, type BuilderErrorKey } from "./builder-errors";
import type { PaneSaveState } from "./course-builder";
import { LessonPane, type LessonDraft } from "./lesson-pane";
import { LessonSettingsPane } from "./lesson-settings-pane";
import type { LessonVersionRegistry } from "./lesson-versions";
import { hasUnsavableResources, savableResources } from "./resources-editor";
import { CONFLICT_CODES, useAutosave } from "./use-autosave";
import { usePaneReport } from "./use-pane-report";
import { createVersionedWriter } from "./versioned-writer";

/** The lesson fields the builder loads (a `classrooms.get` lesson). */
export type LessonLike = {
  id: number;
  title: string;
  updatedAt: string;
  body?: unknown;
  resources?: { label: string; url: string }[] | null;
  examMandatory?: boolean | null;
  examPassThreshold?: number | null;
  examMaxAttempts?: number | null;
  examQuestions?: unknown;
};

function draftFrom(lesson: LessonLike): LessonDraft {
  return {
    title: lesson.title,
    body: lesson.body ?? null,
    resources: (lesson.resources ?? []).map((r) => ({
      label: r.label,
      url: r.url,
    })),
    exam: {
      mandatory: lesson.examMandatory ?? false,
      passThreshold: lesson.examPassThreshold ?? 70,
      maxAttempts: lesson.examMaxAttempts ?? 0,
      questions: Array.isArray(lesson.examQuestions)
        ? (lesson.examQuestions as ExamQuestion[])
        : [],
    },
  };
}

/** The saved form of a draft: what the server stores and the cache mirrors. */
function savedFields(draft: LessonDraft) {
  return {
    title: draft.title.trim(),
    body: stripIncompleteMaterials(draft.body),
    resources: savableResources(draft.resources),
    examMandatory: draft.exam.mandatory,
    examPassThreshold: draft.exam.passThreshold,
    examMaxAttempts: draft.exam.maxAttempts,
    examQuestions: draft.exam.questions,
  };
}

export type LessonEditorScopeProps = {
  lesson: LessonLike;
  courseSlug: string;
  readOnly: boolean;
  /** Where outline changes that rewrite this lesson find its save queue. */
  versions: LessonVersionRegistry;
  onStatusChange: (state: PaneSaveState) => void;
  /** True once a lesson was deleted: its pending edits are dropped, not saved. */
  isDeleted: (lessonId: number) => boolean;
  /** Called after this lesson was deleted from its settings pane. */
  onDeleted: (lessonId: number) => void;
  settingsCollapsed: boolean;
  onToggleSettings: () => void;
};

/**
 * Everything that edits one lesson: its draft, its one autosave, and the two
 * columns that edit it (the lesson pane in the middle, the settings pane on
 * the right). Render it with `key={lesson.id}`: switching lessons then
 * unmounts this scope, and the autosave's unmount flush saves the old draft
 * with the old lesson's own id and version — never under the next lesson.
 *
 * Each lesson keeps its own version chain (`expectedUpdatedAt`) in its own
 * writer, separate from the course's: lesson saves never race course saves.
 * The writer is registered with the builder's lesson versions, so an outline
 * change that rewrites this lesson waits its turn in the same queue and hands
 * the next save the lesson's new version (see lesson-versions.ts).
 */
export function LessonEditorScope({
  lesson,
  courseSlug,
  readOnly,
  versions,
  onStatusChange,
  isDeleted,
  onDeleted,
  settingsCollapsed,
  onToggleSettings,
}: LessonEditorScopeProps) {
  const t = useTranslations("classroomBuilder");
  const utils = api.useUtils();
  const { mutateAsync } = api.classrooms.updateLesson.useMutation();
  const settingsId = useId();

  const [draft, setDraft] = useState<LessonDraft>(() => draftFrom(lesson));
  const [saveError, setSaveError] = useState<BuilderErrorKey | null>(null);

  const lessonId = lesson.id;
  const [writer] = useState(() => createVersionedWriter(lesson.updatedAt));
  const isDeletedRef = useRef(isDeleted);
  useEffect(() => {
    isDeletedRef.current = isDeleted;
  });

  const save = useCallback(
    async (value: LessonDraft) => {
      if (isDeletedRef.current(lessonId)) return;
      const fields = savedFields(value);
      try {
        await writer.run(async (expectedUpdatedAt) => {
          const { updatedAt } = await mutateAsync({
            lessonId,
            ...fields,
            expectedUpdatedAt,
          });
          // Keep the shared course query in step: the outline's Empty and quiz
          // tags, the publish checklist, and the next visit to this lesson
          // (with its new version) all read it. Written inside the queue, so
          // an outline change queued after this save updates it later.
          utils.classrooms.get.setData({ slug: courseSlug }, (old) =>
            old
              ? {
                  ...old,
                  lessons: old.lessons.map((l) =>
                    l.id === lessonId
                      ? {
                          ...l,
                          ...fields,
                          body: fields.body as (typeof l)["body"],
                          updatedAt,
                        }
                      : l,
                  ),
                }
              : old,
          );
          return updatedAt;
        });
      } catch (err) {
        const code = err instanceof Error ? err.message : undefined;
        // A conflict is shown once, by the top bar's reload banner.
        if (!code || !CONFLICT_CODES.has(code)) {
          setSaveError(builderErrorKey(code));
        }
        throw err;
      }
      setSaveError(null);
    },
    [writer, mutateAsync, lessonId, courseSlug, utils],
  );

  const titleValid = draft.title.trim() !== "";
  const autosave = useAutosave({
    value: draft,
    save,
    enabled: !readOnly && titleValid,
  });
  // Declared after the autosave: on close, its last save is queued in the
  // writer before the registration is released (effects clean up in order).
  useEffect(
    () => versions.register(lessonId, writer),
    [versions, lessonId, writer],
  );
  // Saving pauses while the title is blank, and a half-typed link is left
  // out of each save. Both are still unsaved work: report them as such.
  usePaneReport({
    autosave,
    paused:
      !readOnly && (!titleValid || hasUnsavableResources(draft.resources)),
    onStatusChange,
  });

  return (
    <>
      <div className="min-w-0 overflow-y-auto">
        <LessonPane
          draft={draft}
          setDraft={setDraft}
          readOnly={readOnly}
          saveError={autosave.status === "error" ? saveError : null}
        />
      </div>

      <aside
        aria-labelledby={`${settingsId}-title`}
        className={cn(
          "border-border min-w-0 overflow-y-auto border-t lg:border-t-0 lg:border-l",
          settingsCollapsed ? "lg:w-12" : "lg:w-80",
        )}
      >
        <div
          className={cn(
            "border-border flex items-center gap-2 border-b px-4 py-2",
            settingsCollapsed && "lg:justify-center lg:border-b-0 lg:px-0",
          )}
        >
          <h2
            id={`${settingsId}-title`}
            className={cn(
              "flex-1 text-sm font-semibold",
              settingsCollapsed && "lg:sr-only",
            )}
          >
            {t("lessonSettings")}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden size-8 lg:inline-flex"
            aria-expanded={!settingsCollapsed}
            aria-controls={`${settingsId}-body`}
            aria-label={
              settingsCollapsed ? t("expandSettings") : t("collapseSettings")
            }
            onClick={onToggleSettings}
          >
            {settingsCollapsed ? <PanelRightOpen /> : <PanelRightClose />}
          </Button>
        </div>
        <div
          id={`${settingsId}-body`}
          className={cn(settingsCollapsed && "lg:hidden")}
        >
          <LessonSettingsPane
            lessonId={lessonId}
            draft={draft}
            setDraft={setDraft}
            readOnly={readOnly}
            onDeleted={() => onDeleted(lessonId)}
          />
        </div>
      </aside>
    </>
  );
}
