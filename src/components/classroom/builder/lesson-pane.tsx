"use client";

import { useId, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/article-editor/rich-text-editor";
import { LexicalRenderer } from "@/lib/lexical";
import { classroomEditorExtensions } from "@/components/classroom/materials/embed-node";
import { classroomBlockRenderers } from "@/components/classroom/materials/block-renderers";
import type { ExamDraft } from "@/components/classroom/exam-editor";
import type { BuilderErrorKey } from "./builder-errors";
import type { ResourceRow } from "./resources-editor";

/** Everything the author edits on one lesson; autosaved as one value. */
export type LessonDraft = {
  title: string;
  body: unknown;
  resources: ResourceRow[];
  exam: ExamDraft;
};

export type LessonPaneProps = {
  draft: LessonDraft;
  setDraft: Dispatch<SetStateAction<LessonDraft>>;
  readOnly: boolean;
  /** Why the last save failed, in the builder's own words; null when it did not. */
  saveError: BuilderErrorKey | null;
};

/**
 * The middle column when a lesson is selected: its title and its content.
 * Saving is owned by the lesson's editor scope; this pane only edits.
 */
export function LessonPane({
  draft,
  setDraft,
  readOnly,
  saveError,
}: LessonPaneProps) {
  const t = useTranslations("classroomBuilder");
  const titleId = useId();
  const titleHintId = useId();
  const bodyLabelId = useId();

  const titleMissing = !readOnly && draft.title.trim() === "";

  return (
    <div className="mx-auto w-full max-w-[70ch] space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={titleId}>{t("lessonTitleLabel")}</Label>
        <Input
          id={titleId}
          value={draft.title}
          onChange={(e) => {
            const title = e.target.value;
            setDraft((d) => ({ ...d, title }));
          }}
          placeholder={t("lessonTitlePlaceholder")}
          maxLength={200}
          disabled={readOnly}
          aria-invalid={titleMissing || undefined}
          aria-describedby={titleMissing ? titleHintId : undefined}
          className="h-auto py-2 text-2xl font-semibold tracking-tight md:text-2xl"
        />
        {titleMissing ? (
          <p id={titleHintId} className="text-destructive text-sm">
            {t("lessonTitleRequired")}
          </p>
        ) : null}
      </div>

      {saveError ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{t(saveError)}</AlertDescription>
        </Alert>
      ) : null}

      <div
        role="group"
        aria-labelledby={bodyLabelId}
        className="flex flex-col gap-1.5"
      >
        <span id={bodyLabelId} className="text-sm leading-none font-medium">
          {t("lessonBodyLabel")}
        </span>
        {readOnly ? (
          // The shared editor has no read-only mode: show what learners see.
          draft.body ? (
            <LexicalRenderer
              content={draft.body}
              blockRenderers={classroomBlockRenderers}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("lessonBodyEmpty")}
            </p>
          )
        ) : (
          <div className="border-border rounded-md border px-3 py-2">
            <RichTextEditor
              initialValue={draft.body}
              onChange={(body) => setDraft((d) => ({ ...d, body }))}
              placeholder={t("lessonBodyPlaceholder")}
              extensions={classroomEditorExtensions}
            />
          </div>
        )}
      </div>
    </div>
  );
}
