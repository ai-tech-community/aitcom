"use client";

import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";

import {
  MAX_OPTIONS,
  MAX_QUESTIONS,
  OPTION_LABEL_MAX,
  QUESTION_LABEL_MAX,
  QUESTION_TYPES,
  type QuestionType,
  type RegistrationQuestion,
} from "@/lib/events/registration-questions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addOption,
  addQuestion,
  changeType,
  moveQuestion,
  removeOption,
  removeQuestion,
  updateOption,
  updateQuestion,
  type QuestionProblem,
} from "../questions-editor-model";

const newId = () => crypto.randomUUID();

/**
 * The organizer's registration questions (#369): a numbered list, each with
 * its wording, kind, required switch and — for choices — its options.
 * Problems are shown under the question they belong to, only after a save
 * was tried (`showProblems`), so a half-typed question is not flagged.
 */
export function RegistrationQuestionsEditor({
  questions,
  onChange,
  problems,
  showProblems,
}: {
  questions: RegistrationQuestion[];
  onChange: (next: RegistrationQuestion[]) => void;
  problems: Record<number, QuestionProblem[]>;
  showProblems: boolean;
}) {
  const t = useTranslations("events.editor.questions");

  return (
    <div className="space-y-4 sm:col-span-2">
      {questions.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("none")}</p>
      ) : (
        <ol className="divide-border border-border divide-y rounded-xl border">
          {questions.map((question, index) => {
            const own = showProblems ? (problems[index] ?? []) : [];
            const labelId = `question-${question.id}-label`;
            return (
              <li key={question.id} className="space-y-4 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-muted-foreground mt-2 font-mono text-xs tabular-nums">
                    {index + 1}
                  </span>
                  <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
                    <div className="space-y-1.5">
                      <Label htmlFor={labelId} className="sr-only">
                        {t("question", { number: index + 1 })}
                      </Label>
                      <Input
                        id={labelId}
                        value={question.label}
                        placeholder={t("questionPlaceholder")}
                        maxLength={QUESTION_LABEL_MAX}
                        aria-invalid={own.includes("label") || undefined}
                        onChange={(e) =>
                          onChange(
                            updateQuestion(questions, index, {
                              label: e.target.value,
                            }),
                          )
                        }
                      />
                      {own.includes("label") ? (
                        <p className="text-destructive text-xs">
                          {t("problem.label")}
                        </p>
                      ) : null}
                    </div>
                    <Select
                      value={question.type}
                      onValueChange={(v) =>
                        onChange(
                          changeType(
                            questions,
                            index,
                            v as QuestionType,
                            newId,
                          ),
                        )
                      }
                    >
                      <SelectTrigger
                        aria-label={t("kindLabel", { number: index + 1 })}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUESTION_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(`kind.${type}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {"options" in question ? (
                  <div className="space-y-2 pl-6">
                    {question.options.map((option, optionIndex) => (
                      <div key={option.id} className="flex items-center gap-2">
                        <Input
                          value={option.label}
                          maxLength={OPTION_LABEL_MAX}
                          aria-label={t("optionLabel", {
                            number: optionIndex + 1,
                            question: index + 1,
                          })}
                          placeholder={t("optionPlaceholder", {
                            number: optionIndex + 1,
                          })}
                          aria-invalid={
                            (own.includes("optionLabel") &&
                              !option.label.trim()) ||
                            undefined
                          }
                          onChange={(e) =>
                            onChange(
                              updateOption(
                                questions,
                                index,
                                optionIndex,
                                e.target.value,
                              ),
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("removeOption", {
                            number: optionIndex + 1,
                          })}
                          disabled={question.options.length <= 2}
                          onClick={() =>
                            onChange(
                              removeOption(questions, index, optionIndex),
                            )
                          }
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                    {own.includes("options") || own.includes("optionLabel") ? (
                      <p className="text-destructive text-xs">
                        {t(
                          own.includes("options")
                            ? "problem.options"
                            : "problem.optionLabel",
                        )}
                      </p>
                    ) : null}
                    {question.options.length < MAX_OPTIONS ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onChange(addOption(questions, index, newId))
                        }
                      >
                        <Plus aria-hidden="true" />
                        {t("addOption")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2 pl-6">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      tone="ink"
                      id={`question-${question.id}-required`}
                      checked={question.required}
                      onCheckedChange={(v) =>
                        onChange(
                          updateQuestion(questions, index, {
                            required: v === true,
                          }),
                        )
                      }
                    />
                    <Label htmlFor={`question-${question.id}-required`}>
                      {t("required")}
                    </Label>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("moveUp", { number: index + 1 })}
                      disabled={index === 0}
                      onClick={() =>
                        onChange(moveQuestion(questions, index, -1))
                      }
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("moveDown", { number: index + 1 })}
                      disabled={index === questions.length - 1}
                      onClick={() =>
                        onChange(moveQuestion(questions, index, 1))
                      }
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => onChange(removeQuestion(questions, index))}
                    >
                      <Trash2 aria-hidden="true" />
                      {t("remove")}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {questions.length < MAX_QUESTIONS ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(addQuestion(questions, newId))}
        >
          <Plus aria-hidden="true" />
          {t("add")}
        </Button>
      ) : (
        <p className="text-muted-foreground text-xs">
          {t("max", { max: MAX_QUESTIONS })}
        </p>
      )}
    </div>
  );
}
