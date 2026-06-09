"use client";

import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { ExamQuestion } from "@/lib/classroom";

export type ExamDraft = {
  mandatory: boolean;
  passThreshold: number;
  maxAttempts: number;
  questions: ExamQuestion[];
};

export function ExamEditor({
  value,
  onChange,
  disabled,
}: {
  value: ExamDraft;
  onChange: (next: ExamDraft) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("classroom");

  const setQuestion = (i: number, q: ExamQuestion) => {
    const questions = value.questions.slice();
    questions[i] = q;
    onChange({ ...value, questions });
  };
  const addQuestion = () =>
    onChange({
      ...value,
      questions: [
        ...value.questions,
        {
          id: crypto.randomUUID(),
          prompt: "",
          type: "single",
          options: ["", ""],
          correctIndex: 0,
        },
      ],
    });
  const removeQuestion = (i: number) =>
    onChange({
      ...value,
      questions: value.questions.filter((_, j) => j !== i),
    });

  return (
    <div className="border-border space-y-4 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id="exam-mandatory"
          checked={value.mandatory}
          onCheckedChange={(c) => onChange({ ...value, mandatory: c === true })}
          disabled={disabled}
        />
        <Label htmlFor="exam-mandatory">{t("examMandatory")}</Label>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>{t("examPassThreshold")}</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={value.passThreshold}
            onChange={(e) =>
              onChange({
                ...value,
                passThreshold: Math.round(Number(e.target.value)),
              })
            }
            disabled={disabled}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("examMaxAttempts")}</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={value.maxAttempts}
            onChange={(e) =>
              onChange({
                ...value,
                maxAttempts: Math.round(Number(e.target.value)),
              })
            }
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-3">
        {value.questions.map((q, i) => (
          <div
            key={q.id}
            className="border-border space-y-2 rounded-md border p-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-mono text-xs">
                {i + 1}
              </span>
              <Input
                value={q.prompt}
                placeholder={t("examQuestionPrompt")}
                onChange={(e) =>
                  setQuestion(i, { ...q, prompt: e.target.value })
                }
                disabled={disabled}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => removeQuestion(i)}
                disabled={disabled}
                aria-label={t("examRemoveQuestion")}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2 pl-6">
                <input
                  type="radio"
                  name={`correct-${q.id}`}
                  checked={q.correctIndex === oi}
                  onChange={() => setQuestion(i, { ...q, correctIndex: oi })}
                  disabled={disabled}
                  aria-label={t("examMarkCorrect")}
                />
                <Input
                  value={opt}
                  placeholder={t("examOption")}
                  onChange={(e) => {
                    const options = q.options.slice();
                    options[oi] = e.target.value;
                    setQuestion(i, { ...q, options });
                  }}
                  disabled={disabled}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() =>
                    setQuestion(i, {
                      ...q,
                      options: q.options.filter((_, j) => j !== oi),
                      // Removing the marked-correct option must not silently
                      // re-key a neighbour: reset to the first option so the
                      // author re-selects (the radio visibly moves).
                      correctIndex:
                        oi === q.correctIndex
                          ? 0
                          : oi < q.correctIndex
                            ? q.correctIndex - 1
                            : q.correctIndex,
                    })
                  }
                  disabled={Boolean(disabled) || q.options.length <= 2}
                  aria-label={t("examRemoveOption")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-6"
              onClick={() =>
                setQuestion(i, { ...q, options: [...q.options, ""] })
              }
              disabled={Boolean(disabled) || q.options.length >= 6}
            >
              <Plus className="mr-1.5 size-3.5" /> {t("examAddOption")}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addQuestion}
          disabled={disabled}
        >
          <Plus className="mr-1.5 size-4" /> {t("examAddQuestion")}
        </Button>
      </div>
    </div>
  );
}
