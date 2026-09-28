"use client";

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { api } from "@/trpc/react";
import { COURSE_TITLE_MIN } from "@/lib/classroom/course-title";
import { useAutosave } from "./use-autosave";
import { usePaneReport } from "./use-pane-report";
import type { VersionedWriter } from "./versioned-writer";
import type { PaneSaveState } from "./course-builder";

export type CourseDetailsDraft = {
  title: string;
  summary: string;
  coverImageUrl: string | null;
};

export type CourseDetails = {
  draft: CourseDetailsDraft;
  setDraft: Dispatch<SetStateAction<CourseDetailsDraft>>;
  titleValid: boolean;
  /** Keep a new title: it joins the draft and is saved straight away. */
  rename: (title: string) => void;
};

/**
 * The course's own fields — title, summary, cover — as one draft with one
 * autosave. The builder owns it (not the details pane) because two places
 * edit it: the details pane, and the title in the top bar. One draft means
 * both always show the same title, and one autosave through the shared
 * course writer means their saves can never race or undo each other.
 */
export function useCourseDetails({
  course,
  writer,
  readOnly,
  onStatusChange,
}: {
  course: {
    id: number;
    slug: string;
    title: string;
    summary: string | null;
    coverImageUrl: string | null;
  };
  /** Shared with every other course write in the builder (see versioned-writer.ts). */
  writer: VersionedWriter;
  readOnly: boolean;
  onStatusChange: (state: PaneSaveState) => void;
}): CourseDetails {
  const utils = api.useUtils();
  const { mutateAsync } = api.classrooms.update.useMutation();

  const [draft, setDraft] = useState<CourseDetailsDraft>(() => ({
    title: course.title,
    summary: course.summary ?? "",
    coverImageUrl: course.coverImageUrl,
  }));

  const titleValid = draft.title.trim().length >= COURSE_TITLE_MIN;
  const courseId = course.id;
  const courseSlug = course.slug;

  const save = useCallback(
    async (value: CourseDetailsDraft) => {
      const fields = {
        title: value.title.trim(),
        summary: value.summary.trim(),
        coverImageUrl: value.coverImageUrl,
      };
      await writer.run(async (expectedUpdatedAt) => {
        const result = await mutateAsync({
          courseId,
          ...fields,
          expectedUpdatedAt,
        });
        return result.updatedAt;
      });
      // Keep the shared course query in step so the checklist and preview
      // see what was saved without a refetch.
      utils.classrooms.get.setData({ slug: courseSlug }, (old) =>
        old ? { ...old, course: { ...old.course, ...fields } } : old,
      );
    },
    [writer, mutateAsync, courseId, courseSlug, utils],
  );

  const autosave = useAutosave({
    value: draft,
    save,
    enabled: !readOnly && titleValid,
  });

  // Saving pauses while the title is too short; that draft is still unsaved work.
  usePaneReport({
    autosave,
    paused: !readOnly && !titleValid,
    onStatusChange,
  });

  // A kept title saves now rather than after the typing pause. The flush runs
  // after the render that holds the new title: the autosave has seen it by
  // then (its own effects run first).
  const [saveNowRequests, setSaveNowRequests] = useState(0);
  const { flush } = autosave;
  useEffect(() => {
    if (saveNowRequests > 0) void flush();
  }, [saveNowRequests, flush]);

  const rename = useCallback((title: string) => {
    setDraft((d) => ({ ...d, title }));
    setSaveNowRequests((n) => n + 1);
  }, []);

  return { draft, setDraft, titleValid, rename };
}
