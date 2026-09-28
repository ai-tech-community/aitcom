"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { useConfirm } from "@/components/confirm-dialog";
import { ExamEditor, type ExamDraft } from "@/components/classroom/exam-editor";
import { builderErrorKey } from "./builder-errors";
import type { LessonDraft } from "./lesson-pane";
import { ResourcesEditor } from "./resources-editor";

/** A quiz exists once it has a question or is required to finish the lesson. */
function hasQuiz(exam: ExamDraft): boolean {
  return exam.questions.length > 0 || exam.mandatory;
}

function withFirstQuestion(exam: ExamDraft): ExamDraft {
  return {
    ...exam,
    questions: [
      {
        id: crypto.randomUUID(),
        prompt: "",
        type: "single",
        options: ["", ""],
        correctIndex: 0,
      },
    ],
  };
}

export type LessonSettingsPaneProps = {
  lessonId: number;
  draft: LessonDraft;
  setDraft: Dispatch<SetStateAction<LessonDraft>>;
  readOnly: boolean;
  /** Called once the server has deleted the lesson. */
  onDeleted: () => void;
};

/**
 * The right column for a lesson: its links, its quiz (with the rules for
 * finishing the lesson), and deleting it. Edits go into the lesson's shared
 * draft, so they autosave with the rest of the lesson.
 */
export function LessonSettingsPane({
  lessonId,
  draft,
  setDraft,
  readOnly,
  onDeleted,
}: LessonSettingsPaneProps) {
  const t = useTranslations("classroomBuilder");
  const confirm = useConfirm();
  const { mutateAsync: deleteLesson } =
    api.classrooms.deleteLesson.useMutation();
  const [deleting, setDeleting] = useState(false);

  const setExam = (exam: ExamDraft) => setDraft((d) => ({ ...d, exam }));

  const remove = async () => {
    const ok = await confirm({
      description: t("deleteLessonConfirm", { title: draft.title.trim() }),
      confirmLabel: t("deleteLesson"),
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteLesson({ lessonId });
    } catch (err) {
      toast.error(
        t(builderErrorKey(err instanceof Error ? err.message : undefined)),
      );
      setDeleting(false);
      return;
    }
    onDeleted();
  };

  return (
    <div className="space-y-8 p-4">
      <section className="space-y-3">
        <SectionLabel as="h3">{t("resourcesSection")}</SectionLabel>
        <ResourcesEditor
          resources={draft.resources}
          onChange={(resources) => setDraft((d) => ({ ...d, resources }))}
          disabled={readOnly}
        />
      </section>

      <section className="space-y-3">
        <SectionLabel as="h3">{t("quizSection")}</SectionLabel>
        {hasQuiz(draft.exam) ? (
          <ExamEditor
            value={draft.exam}
            onChange={setExam}
            disabled={readOnly}
          />
        ) : readOnly ? (
          <p className="text-muted-foreground text-sm">{t("noQuiz")}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">{t("addQuizHint")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExam(withFirstQuestion(draft.exam))}
            >
              <Plus />
              {t("addQuiz")}
            </Button>
          </div>
        )}
      </section>

      {readOnly ? null : (
        <div className="border-border border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={deleting}
            onClick={() => void remove()}
          >
            <Trash2 />
            {t("deleteLesson")}
          </Button>
        </div>
      )}
    </div>
  );
}
