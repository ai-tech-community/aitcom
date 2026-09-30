import type { EditorSectionId } from "./editor-layout";
import type { EventEditorMode, EventFormData } from "./event-form-model";
import { questionProblems } from "./questions-editor-model";

/**
 * What an event needs before it can be saved, as a list the editor shows
 * ("Ready to save") and uses to tick finished sections in its menu. Mirrors
 * what the server refuses: a title of 3+ characters, a date, a place, an
 * audience (required when creating), and finished questions.
 */
export type ChecklistItemId =
  | "title"
  | "audience"
  | "date"
  | "location"
  | "questions";

export interface ChecklistItem {
  id: ChecklistItemId;
  section: EditorSectionId;
  done: boolean;
}

export function editorChecklist(
  form: EventFormData,
  mode: EventEditorMode,
): ChecklistItem[] {
  const questionsApply = !form.sourceUrl.trim();
  const items: ChecklistItem[] = [
    { id: "title", section: "basics", done: form.title.trim().length >= 3 },
    {
      id: "audience",
      section: "audience",
      done: form.audience.length > 0,
    },
    { id: "date", section: "when", done: !!form.date },
    { id: "location", section: "where", done: !!form.location.trim() },
  ];
  if (questionsApply && form.registrationQuestions.length > 0) {
    items.push({
      id: "questions",
      section: "registration",
      done:
        Object.keys(questionProblems(form.registrationQuestions)).length === 0,
    });
  }
  // Editing an event that already has no audience is allowed (#210 clears
  // it on purpose); only a new event must pick one.
  return mode === "create"
    ? items
    : items.filter((i) => i.id !== "audience" || i.done);
}

/** Sections whose every checklist item is done; others get no tick. */
export function finishedSections(
  items: readonly ChecklistItem[],
): Set<EditorSectionId> {
  const bySection = new Map<EditorSectionId, boolean>();
  for (const item of items) {
    bySection.set(
      item.section,
      (bySection.get(item.section) ?? true) && item.done,
    );
  }
  return new Set(
    [...bySection].filter(([, done]) => done).map(([section]) => section),
  );
}
