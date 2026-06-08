"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import type { PublicExamQuestion } from "@/lib/classroom";

type LessonExam = {
  lessonId: number;
  mandatory: boolean;
  passThreshold: number;
  maxAttempts: number;
  questions: PublicExamQuestion[];
};
type Attempt = { lessonId: number; score: number; passed: boolean };

/** Stable per-mount shuffle so option order doesn't jump as the user clicks. */
function shuffled<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function ExamRunner({
  exam,
  attempts,
  completed,
  preview = false,
}: {
  exam: LessonExam;
  attempts: Attempt[];
  completed: boolean;
  /** Author previewing-as-learner: show the questions read-only, no submission. */
  preview?: boolean;
}) {
  const t = useTranslations("classroom");
  const utils = api.useUtils();
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [result, setResult] = useState<
    { score: number; passed: boolean; wrongQuestionIds: string[] } | null
  >(null);

  // Display order: shuffle questions, and shuffle each question's options while
  // remembering the original index so grading stays correct.
  const display = useMemo(
    () =>
      shuffled(exam.questions).map((q) => ({
        ...q,
        shown: shuffled(q.options.map((label, originalIndex) => ({ label, originalIndex }))),
      })),
    [exam.questions],
  );

  const mine = attempts.filter((a) => a.lessonId === exam.lessonId);
  const passed = completed || mine.some((a) => a.passed);
  const attemptsUsed = mine.length;
  const outOfAttempts =
    !passed && exam.maxAttempts > 0 && attemptsUsed >= exam.maxAttempts;

  const submit = api.classrooms.submitExamAttempt.useMutation({
    onSuccess: (r) => {
      setResult(r);
      if (r.passed) toast.success(t("examPassedToast", { score: r.score }));
      else toast.error(t("examFailedToast", { score: r.score }));
      void utils.classrooms.get.invalidate();
    },
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });

  return (
    <div className="border-border bg-muted/30 space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">{t("exam")}</h4>
        <span className="text-muted-foreground text-xs">
          {t("examThresholdLabel", { percent: exam.passThreshold })}
          {exam.maxAttempts > 0
            ? ` · ${t("examAttemptsLabel", { used: attemptsUsed, max: exam.maxAttempts })}`
            : null}
        </span>
      </div>

      {passed && !preview ? (
        <p className="text-sm font-medium text-green-600">
          {t("examAlreadyPassed", {
            score: Math.max(0, ...mine.filter((a) => a.passed).map((a) => a.score)),
          })}
        </p>
      ) : (
        <>
          {display.map((q, qi) => (
            <fieldset key={q.id} className="space-y-1.5">
              <legend className="text-sm font-medium">
                {qi + 1}. {q.prompt}
                {result?.wrongQuestionIds.includes(q.id) ? (
                  <span className="ml-2 text-xs text-red-600">{t("examWrong")}</span>
                ) : null}
              </legend>
              {q.shown.map((opt) => (
                <label key={opt.originalIndex} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={q.id}
                    checked={picks[q.id] === opt.originalIndex}
                    onChange={() =>
                      setPicks((p) => ({ ...p, [q.id]: opt.originalIndex }))
                    }
                    disabled={preview || submit.isPending || outOfAttempts}
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>
          ))}

          {preview ? (
            <p className="text-muted-foreground text-xs italic">
              {t("examPreviewNote")}
            </p>
          ) : outOfAttempts ? (
            <p className="text-sm text-red-600">{t("examNoAttemptsLeft")}</p>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={submit.isPending || Object.keys(picks).length === 0}
              onClick={() =>
                submit.mutate({
                  lessonId: exam.lessonId,
                  answers: Object.entries(picks).map(([questionId, selectedIndex]) => ({
                    questionId,
                    selectedIndex,
                  })),
                })
              }
            >
              {mine.length > 0 ? t("examRetry") : t("examSubmit")}
            </Button>
          )}
        </>
      )}

      {!preview && mine.length > 0 ? (
        <div className="text-muted-foreground space-y-0.5 text-xs">
          <p className="font-medium">{t("examHistory")}</p>
          {mine.map((a, i) => (
            <p key={i}>
              {t("examAttemptLine", {
                n: i + 1,
                score: a.score,
                result: a.passed ? t("examPass") : t("examFail"),
              })}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
