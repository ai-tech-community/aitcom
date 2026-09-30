"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { EditorSection, Field } from "../editor-layout";
import type { QuestionProblem } from "../questions-editor-model";
import { RegistrationQuestionsEditor } from "./registration-questions-editor";
import type { SectionProps } from "./types";

/**
 * How people sign up: here (with a seat limit and the organizer's
 * questions) or on another site. A link to another site makes the event
 * external — people register there, so no questions are asked here.
 */
export function RegistrationSection({
  form,
  update,
  problems,
  showProblems,
}: SectionProps & {
  problems: Record<number, QuestionProblem[]>;
  showProblems: boolean;
}) {
  const t = useTranslations("events");
  const te = useTranslations("events.editor");
  const external = form.sourceUrl.trim().length > 0;

  return (
    <EditorSection
      id="registration"
      title={te("sections.registration")}
      description={te("sections.registrationHint")}
    >
      <Field
        id="event-source"
        label={te("externalLink")}
        hint={te("externalLinkHint")}
        wide
      >
        <Input
          id="event-source"
          type="url"
          value={form.sourceUrl}
          onChange={(e) => update({ sourceUrl: e.target.value })}
          placeholder="https://lu.ma/..."
          aria-describedby="event-source-hint"
        />
      </Field>
      {external ? (
        <p className="text-muted-foreground text-sm sm:col-span-2">
          {te("externalNoQuestions")}
        </p>
      ) : (
        <>
          <Field
            id="event-max"
            label={t("eventMaxAttendees")}
            hint={te("maxAttendeesHint")}
          >
            <Input
              id="event-max"
              type="number"
              min={1}
              value={form.maxAttendees}
              onChange={(e) => update({ maxAttendees: e.target.value })}
            />
          </Field>
          <div className="hidden sm:block" />
          <div className="space-y-1 sm:col-span-2">
            <h3 className="text-sm font-medium">{te("questions.title")}</h3>
            <p className="text-muted-foreground text-sm">
              {te("questions.hint")}
            </p>
          </div>
          <RegistrationQuestionsEditor
            questions={form.registrationQuestions}
            onChange={(registrationQuestions) =>
              update({ registrationQuestions })
            }
            problems={problems}
            showProblems={showProblems}
          />
        </>
      )}
    </EditorSection>
  );
}
