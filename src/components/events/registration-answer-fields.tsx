"use client";

import { useTranslations } from "next-intl";

import {
  LONG_ANSWER_MAX,
  SHORT_ANSWER_MAX,
  type AnswerProblem,
  type RegistrationAnswers,
  type RegistrationQuestion,
} from "@/lib/events/registration-questions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The organizer's questions as form fields: short and long text, pick one
 * (radio buttons), pick several (checkboxes). A problem is shown under its
 * own question and tied to it with aria-describedby.
 */
export function RegistrationAnswerFields({
  questions,
  answers,
  onChange,
  problems,
}: {
  questions: readonly RegistrationQuestion[];
  answers: RegistrationAnswers;
  onChange: (next: RegistrationAnswers) => void;
  problems: Record<string, AnswerProblem>;
}) {
  const t = useTranslations("events.registration");
  const set = (id: string, value: string | string[]) =>
    onChange({ ...answers, [id]: value });

  return (
    <div className="space-y-5">
      {questions.map((q) => {
        const inputId = `answer-${q.id}`;
        const problem = problems[q.id];
        const problemId = problem ? `${inputId}-problem` : undefined;
        const label = (
          <>
            {q.label}
            {q.required ? (
              <span className="text-muted-foreground"> ({t("required")})</span>
            ) : null}
          </>
        );
        const message = problem ? (
          <p id={problemId} className="text-destructive text-xs">
            {t(`answerProblem.${problem}`)}
          </p>
        ) : null;
        const value = answers[q.id];

        if (q.type === "short_text" || q.type === "long_text") {
          const Control = q.type === "short_text" ? Input : Textarea;
          return (
            <div key={q.id} className="space-y-1.5">
              <Label htmlFor={inputId}>{label}</Label>
              <Control
                id={inputId}
                value={typeof value === "string" ? value : ""}
                maxLength={
                  q.type === "short_text" ? SHORT_ANSWER_MAX : LONG_ANSWER_MAX
                }
                rows={q.type === "long_text" ? 3 : undefined}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problemId}
                onChange={(e) => set(q.id, e.target.value)}
              />
              {message}
            </div>
          );
        }

        const chosen = Array.isArray(value) ? value : value ? [value] : [];
        return (
          <fieldset
            key={q.id}
            className="space-y-2"
            aria-invalid={problem ? true : undefined}
            aria-describedby={problemId}
          >
            <legend className="text-sm leading-none font-medium">
              {label}
            </legend>
            {q.options.map((option) => {
              const optionId = `${inputId}-${option.id}`;
              return (
                <div key={option.id} className="flex items-center gap-2">
                  {q.type === "single_choice" ? (
                    <input
                      id={optionId}
                      type="radio"
                      name={inputId}
                      value={option.id}
                      checked={chosen[0] === option.id}
                      onChange={() => set(q.id, option.id)}
                      className="accent-foreground size-4"
                    />
                  ) : (
                    <Checkbox
                      tone="ink"
                      id={optionId}
                      checked={chosen.includes(option.id)}
                      onCheckedChange={(on) =>
                        set(
                          q.id,
                          on === true
                            ? [...chosen, option.id]
                            : chosen.filter((id) => id !== option.id),
                        )
                      }
                    />
                  )}
                  <Label htmlFor={optionId} className="font-normal">
                    {option.label}
                  </Label>
                </div>
              );
            })}
            {message}
          </fieldset>
        );
      })}
    </div>
  );
}
