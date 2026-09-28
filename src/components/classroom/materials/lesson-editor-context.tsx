"use client";

import { createContext, useContext } from "react";

/**
 * What lesson-editor nodes need to know about the lesson they sit in. Lexical
 * decorators are rendered inside the editor's React tree, so they read this
 * context like any other component.
 */
export type LessonEditorContextValue = {
  courseId: number | null;
  canUpload: boolean;
};

const LessonEditorContext = createContext<LessonEditorContextValue>({
  courseId: null,
  canUpload: false,
});

export const LessonEditorProvider = LessonEditorContext.Provider;

export function useLessonEditorContext(): LessonEditorContextValue {
  return useContext(LessonEditorContext);
}
