"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import {
  validateAnswers,
  type AnswerProblem,
  type RegistrationAnswers,
  type RegistrationQuestion,
} from "@/lib/events/registration-questions";
import { personNameSchema, suggestNameParts } from "@/lib/person-name";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RegistrationAnswerFields } from "./registration-answer-fields";

export interface RegistrationNames {
  firstName: string;
  lastName: string;
}

export interface RegistrationSubmission {
  names?: RegistrationNames;
  answers: RegistrationAnswers;
}

/**
 * What a member tells the organizer when registering (ADR-0038, #369):
 * - first and last name, once, when the account has none — pre-filled by
 *   splitting the current name on its first space;
 * - answers to the organizer's questions, checked with the same
 *   `validateAnswers` the server enforces.
 * In `answers` mode it only edits the answers of an existing registration.
 */
export function RegistrationDialog({
  open,
  mode,
  askNames,
  currentName,
  questions,
  initialAnswers,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  mode: "register" | "answers";
  askNames: boolean;
  currentName: string | null | undefined;
  questions: readonly RegistrationQuestion[];
  initialAnswers?: RegistrationAnswers;
  pending: boolean;
  onConfirm: (submission: RegistrationSubmission) => void;
  onClose: () => void;
}) {
  const t = useTranslations("events.registration");
  const suggested = suggestNameParts(currentName);
  const [firstName, setFirstName] = useState(suggested.firstName);
  const [lastName, setLastName] = useState(suggested.lastName);
  const [answers, setAnswers] = useState<RegistrationAnswers>(
    initialAnswers ?? {},
  );
  const [showErrors, setShowErrors] = useState(false);

  const first = personNameSchema.safeParse(firstName);
  const last = personNameSchema.safeParse(lastName);
  const checked = validateAnswers(questions, answers);
  const answerProblems: Record<string, AnswerProblem> =
    showErrors && !checked.ok ? checked.problems : {};

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const namesOk = !askNames || (first.success && last.success);
    if (!namesOk || !checked.ok) {
      setShowErrors(true);
      return;
    }
    onConfirm({
      names:
        askNames && first.success && last.success
          ? { firstName: first.data, lastName: last.data }
          : undefined,
      answers: checked.answers,
    });
  }

  const title =
    mode === "answers"
      ? t("answersTitle")
      : questions.length > 0
        ? t("questionsTitle")
        : t("namesTitle");
  const description =
    mode === "answers"
      ? t("answersDescription")
      : askNames
        ? t("namesDescription")
        : t("questionsDescription");

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          {askNames ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <NameField
                id="registration-first-name"
                label={t("firstName")}
                value={firstName}
                onChange={setFirstName}
                autoComplete="given-name"
                invalid={showErrors && !first.success}
                message={t("nameRequired")}
              />
              <NameField
                id="registration-last-name"
                label={t("lastName")}
                value={lastName}
                onChange={setLastName}
                autoComplete="family-name"
                invalid={showErrors && !last.success}
                message={t("nameRequired")}
              />
            </div>
          ) : null}

          {questions.length > 0 ? (
            <RegistrationAnswerFields
              questions={questions}
              answers={answers}
              onChange={setAnswers}
              problems={answerProblems}
            />
          ) : null}

          {mode === "register" ? (
            <p className="text-muted-foreground text-xs">
              {t("organizerNotice")}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("namesCancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {mode === "answers" ? t("answersSave") : t("namesConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NameField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  invalid,
  message,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  invalid: boolean;
  message: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={100}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
      />
      {invalid ? (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {message}
        </p>
      ) : null}
    </div>
  );
}
