"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Archive } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api, type RouterOutputs } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useConfirm } from "@/components/confirm-dialog";
import { CourseView } from "@/components/classroom/course-view";
import type { ChecklistInput } from "@/lib/classroom/publish-checklist";
import { BuilderTopBar } from "./builder-top-bar";
import { CourseDetailsPane } from "./course-details-pane";
import { builderErrorKey } from "./builder-errors";
import { createVersionedWriter } from "./versioned-writer";
import { CourseOutline } from "./course-outline";
import { buildOutline, readingOrder } from "./outline-model";
import { LessonEditorScope } from "./lesson-editor-scope";
import {
  createLessonVersionRegistry,
  type RewriteLessons,
} from "./lesson-versions";
import { PublishDialog } from "./publish-dialog";
import { useUnsavedChangesGuard, type AutosaveStatus } from "./use-autosave";
import { usePersistedFlag } from "./use-persisted-flag";

export type BuilderSelection =
  | { kind: "details" }
  | { kind: "lesson"; lessonId: number };

/** What every editing pane reports up to the builder (via `onStatusChange`). */
export type PaneSaveState = {
  status: AutosaveStatus;
  savedAt: Date | null;
  retry: () => Promise<void>;
  /** Saves pending work now; resolves with the pane's status once settled. */
  flush: () => Promise<AutosaveStatus>;
};

/** Worst first: the top bar shows the most urgent state of any pane. */
const SEVERITY: readonly AutosaveStatus[] = [
  "conflict",
  "error",
  "saving",
  "dirty",
  "saved",
  "idle",
];

/**
 * One visible save status for the whole builder: the most urgent pane state,
 * the most recent save time, and a retry that retries every failed pane.
 */
export function combineSaveStates(states: readonly PaneSaveState[]): {
  status: AutosaveStatus;
  savedAt: Date | null;
  retry: () => Promise<void>;
} {
  const status =
    SEVERITY.find((s) => states.some((p) => p.status === s)) ?? "idle";
  const savedAt = states.reduce<Date | null>(
    (latest, p) =>
      p.savedAt && (!latest || p.savedAt > latest) ? p.savedAt : latest,
    null,
  );
  const failed = states.filter((p) => p.status === "error");
  const retry = async () => {
    await Promise.all(failed.map((p) => p.retry()));
  };
  return { status, savedAt, retry };
}

const UNSAFE: ReadonlySet<AutosaveStatus> = new Set([
  "dirty",
  "saving",
  "error",
  "conflict",
]);

/**
 * Publish, unpublish and Preview act on what the server has. They go ahead
 * only when every pane's work is safely saved — never past a failed save, a
 * conflict, or a draft that cannot be saved yet (a too-short title).
 */
export function canLeaveEditing(statuses: readonly AutosaveStatus[]): boolean {
  return statuses.every((s) => !UNSAFE.has(s));
}

/** A publish/unpublish refused as stale shows up as a conflict like any pane's. */
const STATUS_CONFLICT: PaneSaveState = {
  status: "conflict",
  savedAt: null,
  retry: async () => undefined,
  flush: async () => "conflict",
};

/**
 * How a status change ended. Every failure has already been shown to the
 * author (toast, or the conflict banner) by the time this is returned.
 */
type StatusChangeOutcome = "done" | "unsaved" | "conflict" | "failed";

/** Where each lesson's editor scope reports its save state. */
const lessonPaneKey = (lessonId: number) => `lesson:${lessonId}`;

/**
 * The panes whose save state counts right now. A lesson's editor scope only
 * lives while that lesson is selected; a report left behind by one that has
 * since closed (it was saved on the way out, or the lesson was deleted) must
 * not hold up the top bar or publishing.
 */
function activePanes(
  states: Record<string, PaneSaveState>,
  selection: BuilderSelection,
): [string, PaneSaveState][] {
  const lessonKey =
    selection.kind === "lesson" ? lessonPaneKey(selection.lessonId) : null;
  return Object.entries(states).filter(
    ([key]) => !key.startsWith("lesson:") || key === lessonKey,
  );
}

const SETTINGS_COLLAPSED_KEY = "classroomBuilder.lessonSettingsCollapsed";

/** Matches Tailwind's `lg`: the outline is a fixed column from here up. */
const OUTLINE_COLUMN_QUERY = "(min-width: 64rem)";

type CourseData = RouterOutputs["classrooms"]["get"];

/**
 * The course builder: a full-width workspace with the outline on the left and
 * one thing being edited in the middle. This container owns loading; the
 * workspace below owns selection, save status, and course-level writes.
 */
export function CourseBuilder({
  slug,
  courseSlug,
}: {
  slug: string;
  courseSlug: string;
}) {
  const t = useTranslations("classroomBuilder");
  const utils = api.useUtils();
  const query = api.classrooms.get.useQuery({ slug: courseSlug });
  // Bumped after a conflict reload: remounts the workspace on fresh data, so
  // every pane restarts from the server's version.
  const [generation, setGeneration] = useState(0);

  const reload = useCallback(async () => {
    await utils.classrooms.get.invalidate({ slug: courseSlug });
    setGeneration((g) => g + 1);
  }, [utils, courseSlug]);

  if (query.isLoading) return <BuilderSkeleton />;

  // Once loaded, the workspace stays mounted even if a background refetch
  // (window focus) fails: unmounting it would drop the author's draft and turn
  // off the leave-page guard. Only a failed first load is an error screen.
  if (!query.data) {
    if (query.isError && query.error.data?.code !== "NOT_FOUND") {
      return <ErrorState onRetry={() => void query.refetch()} />;
    }
    return (
      <EmptyState
        title={t("courseNotFound")}
        description={t("courseNotFoundHint")}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/communities/${slug}/classroom` as never}>
              {t("backToClassroom")}
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <CourseWorkspace
      key={generation}
      slug={slug}
      courseSlug={courseSlug}
      data={query.data}
      onReload={reload}
    />
  );
}

function resolveSelection(
  lessonParam: string | null,
  lessons: readonly { id: number }[],
): BuilderSelection {
  const lessonId = Number(lessonParam);
  if (lessonParam && lessons.some((l) => l.id === lessonId)) {
    return { kind: "lesson", lessonId };
  }
  return { kind: "details" };
}

function CourseWorkspace({
  slug,
  courseSlug,
  data,
  onReload,
}: {
  slug: string;
  courseSlug: string;
  data: CourseData;
  onReload: () => Promise<void>;
}) {
  const t = useTranslations("classroomBuilder");
  const utils = api.useUtils();
  const update = api.classrooms.update.useMutation();
  const { course, lessons, modules } = data;
  const readOnly = course.status === "archived";

  // One writer per workspace mount, seeded with the version this mount loaded.
  const [writer] = useState(() => createVersionedWriter(course.updatedAt));
  // The save queues of the lessons being edited, for outline changes that
  // rewrite lessons (and so give them new versions).
  const [lessonVersions] = useState(createLessonVersionRegistry);
  const rewriteLessons = useCallback<RewriteLessons>(
    async (write) => {
      const result = await lessonVersions.rewrite(write);
      const changed = new Map(result.lessons.map((l) => [l.id, l.updatedAt]));
      // A lesson opened later seeds its writer from the cache: keep it current.
      utils.classrooms.get.setData({ slug: courseSlug }, (old) =>
        old
          ? {
              ...old,
              lessons: old.lessons.map((l) => {
                const updatedAt = changed.get(l.id);
                return updatedAt === undefined ? l : { ...l, updatedAt };
              }),
            }
          : old,
      );
      return result;
    },
    [lessonVersions, utils, courseSlug],
  );

  const searchParams = useSearchParams();
  const selection = resolveSelection(searchParams.get("lesson"), lessons);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // The outline lives in one place at a time: its column on wide screens, a
  // sheet on small ones. Mounting it twice would mean two drag contexts and
  // two optimistic orders. The server render assumes the column.
  const outlineColumn = useMediaQuery(OUTLINE_COLUMN_QUERY, true);

  const selectionRef = useRef(selection);
  useEffect(() => {
    selectionRef.current = selection;
  });

  /** Changes the selection straight away. Callers first make sure no work is lost. */
  const select = useCallback((next: BuilderSelection) => {
    const url = new URL(window.location.href);
    if (next.kind === "lesson") {
      url.searchParams.set("lesson", String(next.lessonId));
    } else {
      url.searchParams.delete("lesson");
    }
    // Shallow: Next.js keeps useSearchParams in step with history.replaceState,
    // so the selection changes without a server round trip or a scroll jump.
    window.history.replaceState(null, "", url);
    setOutlineOpen(false);
  }, []);

  // Save state reported by the editing panes, keyed by pane.
  const [paneStates, setPaneStates] = useState<Record<string, PaneSaveState>>(
    {},
  );
  const paneStatesRef = useRef(paneStates);
  useEffect(() => {
    paneStatesRef.current = paneStates;
  });
  const reportPane = useCallback((key: string, state: PaneSaveState) => {
    setPaneStates((prev) => ({ ...prev, [key]: state }));
  }, []);
  const reportDetails = useCallback(
    (state: PaneSaveState) => reportPane("details", state),
    [reportPane],
  );
  // Lessons deleted during this visit. Their editor scope may still hold
  // unsaved edits; those are dropped, never sent for a lesson that is gone.
  const deletedLessons = useRef(new Set<number>());
  const isLessonDeleted = useCallback(
    (lessonId: number) => deletedLessons.current.has(lessonId),
    [],
  );
  const markLessonDeleted = useCallback((lessonId: number) => {
    deletedLessons.current.add(lessonId);
  }, []);

  /**
   * Flush every pane, then say whether it is safe to act on the saved course.
   * If not, show the problem and explain in a toast: an open lesson that
   * holds unsaved work stays open; otherwise the details pane opens when it
   * is the one holding it.
   */
  const saveAllFirst = useCallback(async (): Promise<boolean> => {
    const results = await Promise.all(
      activePanes(paneStatesRef.current, selectionRef.current).map(
        async ([key, pane]) => [key, await pane.flush()] as const,
      ),
    );
    if (canLeaveEditing(results.map(([, status]) => status))) return true;
    const blocking = (match: (key: string) => boolean) =>
      results.some(([key, status]) => match(key) && UNSAFE.has(status));
    if (
      !blocking((key) => key.startsWith("lesson:")) &&
      blocking((key) => key === "details")
    ) {
      select({ kind: "details" });
    }
    toast.error(t("finishSavingFirst"));
    return false;
  }, [select, t]);

  /**
   * Every author-driven selection change. Leaving a lesson first saves it and
   * waits for that save, so the next pane never reads stale data and no edit
   * is dropped. When it cannot be saved (a blank title, a failed save, a
   * conflict), the lesson stays open so the author can see why.
   */
  const navigate = useCallback(
    async (next: BuilderSelection) => {
      const current = selectionRef.current;
      const leaving =
        current.kind === "lesson" &&
        !(next.kind === "lesson" && next.lessonId === current.lessonId) &&
        !deletedLessons.current.has(current.lessonId);
      if (leaving) {
        const pane = paneStatesRef.current[lessonPaneKey(current.lessonId)];
        if (pane && UNSAFE.has(await pane.flush())) {
          setOutlineOpen(false);
          toast.error(t("finishSavingFirst"));
          return;
        }
      }
      select(next);
    },
    [select, t],
  );

  /** The open lesson was deleted from its settings pane: open the next one. */
  const lessonDeletedHere = useCallback(
    (lessonId: number) => {
      markLessonDeleted(lessonId);
      // Same rule as deleting from the outline: the next lesson in reading order.
      const order = readingOrder(buildOutline(lessons, modules));
      const next = order[order.indexOf(lessonId) + 1];
      select(
        next === undefined
          ? { kind: "details" }
          : { kind: "lesson", lessonId: next },
      );
      void utils.classrooms.get.invalidate({ slug: courseSlug });
    },
    [lessons, modules, markLessonDeleted, select, utils, courseSlug],
  );

  const [settingsCollapsed, setSettingsCollapsed] = usePersistedFlag(
    SETTINGS_COLLAPSED_KEY,
  );

  const panes = activePanes(paneStates, selection);
  const save = combineSaveStates(panes.map(([, state]) => state));
  // Name what changed elsewhere: only the open lesson, or the course itself.
  const conflictKey = panes.every(
    ([key, state]) => state.status !== "conflict" || key.startsWith("lesson:"),
  )
    ? "errorLessonChangedElsewhere"
    : "errorChangedElsewhere";
  useUnsavedChangesGuard(UNSAFE.has(save.status));

  const [statusChanging, setStatusChanging] = useState(false);
  /**
   * The one path that changes a course's status. It saves every pane first
   * (never publish past unsaved work), writes through the shared course
   * writer (so the next autosave sees the new version), and reports any
   * failure to the author before returning how it ended.
   */
  const changeStatus = async (
    next: "draft" | "published",
  ): Promise<StatusChangeOutcome> => {
    setStatusChanging(true);
    try {
      if (!(await saveAllFirst())) return "unsaved";
      await writer.run(async (expectedUpdatedAt) => {
        const result = await update.mutateAsync({
          courseId: course.id,
          status: next,
          expectedUpdatedAt,
        });
        return result.updatedAt;
      });
      utils.classrooms.get.setData({ slug: courseSlug }, (old) =>
        old ? { ...old, course: { ...old.course, status: next } } : old,
      );
      return "done";
    } catch (err) {
      const code = err instanceof Error ? err.message : undefined;
      if (code === "COURSE_CHANGED") {
        reportPane("status", STATUS_CONFLICT);
        return "conflict";
      }
      toast.error(t(builderErrorKey(code)));
      return "failed";
    } finally {
      setStatusChanging(false);
    }
  };

  // Publish: save first so the checklist judges what would really go live,
  // then let the dialog run the checks and the confirm.
  const [publishOpen, setPublishOpen] = useState(false);
  const openPublish = async () => {
    setStatusChanging(true);
    try {
      if (await saveAllFirst()) setPublishOpen(true);
    } finally {
      setStatusChanging(false);
    }
  };
  const publish = async () => {
    const outcome = await changeStatus("published");
    if (outcome === "done") return;
    // Unsaved work or a conflict is fixed in the editor, not in the dialog:
    // close it so the problem is in view. Other failures can simply be retried.
    if (outcome === "unsaved" || outcome === "conflict") setPublishOpen(false);
    throw new Error(outcome);
  };

  const confirm = useConfirm();
  const moveToDraft = async () => {
    const ok = await confirm({
      title: t("moveToDraftTitle"),
      description: t("moveToDraftConfirm"),
      confirmLabel: t("moveToDraft"),
    });
    if (ok) await changeStatus("draft");
  };

  // Where a failed publish check sends the author: back to editing, with the
  // outline in view (on small screens it lives in a sheet).
  const goToLesson = (lessonId: number) => {
    setPreviewing(false);
    void navigate({ kind: "lesson", lessonId });
  };
  const goToOutline = () => {
    setPreviewing(false);
    if (!outlineColumn) setOutlineOpen(true);
  };

  const checklistInput = useMemo<ChecklistInput>(
    () => ({
      title: course.title,
      coverImageUrl: course.coverImageUrl ?? null,
      lessons,
      modules,
    }),
    [course.title, course.coverImageUrl, lessons, modules],
  );

  const togglePreview = async () => {
    if (!previewing) {
      if (!(await saveAllFirst())) return;
      // Lesson saves write their own fields into the cache, but not the
      // server-derived parts Preview reads (the quiz summary). Refetch so
      // Preview shows what was just saved. Safe: editing panes seed once.
      await utils.classrooms.get.invalidate({ slug: courseSlug });
    }
    setPreviewing((p) => !p);
  };

  const selectedLesson =
    selection.kind === "lesson"
      ? lessons.find((l) => l.id === selection.lessonId)
      : undefined;

  const outline = (
    <CourseOutline
      courseId={course.id}
      lessons={lessons}
      modules={modules}
      selection={selection}
      onSelect={(next) => void navigate(next)}
      onLessonDeleted={markLessonDeleted}
      rewriteLessons={rewriteLessons}
      readOnly={readOnly}
    />
  );

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3rem-1px)]">
      <BuilderTopBar
        slug={slug}
        courseSlug={courseSlug}
        title={course.title}
        status={course.status}
        isPublic={!!course.isPublic}
        saveStatus={save.status}
        conflictKey={conflictKey}
        savedAt={save.savedAt}
        onRetry={() => void save.retry()}
        onReload={() => void onReload()}
        previewing={previewing}
        onTogglePreview={() => void togglePreview()}
        onPublish={() => void openPublish()}
        onUnpublish={() => void moveToDraft()}
        statusChanging={statusChanging}
        onOpenOutline={() => setOutlineOpen(true)}
      />

      {readOnly ? (
        <div className="px-4 pt-4 sm:px-6">
          <Alert>
            <Archive aria-hidden="true" />
            <AlertDescription>{t("archivedBanner")}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {previewing ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
          <CourseView slug={slug} courseSlug={courseSlug} embedded />
        </div>
      ) : null}

      {/* Panes stay mounted while previewing so no draft is ever dropped. */}
      <div
        className={cn(
          "grid min-h-0 flex-1 lg:grid-cols-[18rem_minmax(0,1fr)_auto]",
          previewing && "hidden",
        )}
      >
        {outlineColumn ? (
          <nav
            aria-label={t("outline")}
            className="border-border hidden overflow-y-auto border-r lg:block"
          >
            <SectionLabel className="mx-3 mt-4">{t("outline")}</SectionLabel>
            {outline}
          </nav>
        ) : null}

        {/* Stays mounted (hidden) while a lesson is open so its draft is kept. */}
        <div
          hidden={selection.kind !== "details"}
          className="min-w-0 overflow-y-auto"
        >
          <CourseDetailsPane
            course={{
              id: course.id,
              slug: course.slug,
              title: course.title,
              summary: course.summary ?? null,
              coverImageUrl: course.coverImageUrl ?? null,
              isPublic: !!course.isPublic,
            }}
            writer={writer}
            readOnly={readOnly}
            onStatusChange={reportDetails}
          />
        </div>

        {/* Keyed by lesson: switching lessons closes this scope, which saves
            any last edits under the old lesson's own id (see the scope). */}
        {selectedLesson ? (
          <LessonEditorScope
            key={selectedLesson.id}
            lesson={selectedLesson}
            courseSlug={courseSlug}
            readOnly={readOnly}
            versions={lessonVersions}
            onStatusChange={(state) =>
              reportPane(lessonPaneKey(selectedLesson.id), state)
            }
            isDeleted={isLessonDeleted}
            onDeleted={lessonDeletedHere}
            settingsCollapsed={settingsCollapsed}
            onToggleSettings={() => setSettingsCollapsed(!settingsCollapsed)}
          />
        ) : null}
      </div>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        input={checklistInput}
        onGoToLesson={goToLesson}
        onGoToOutline={goToOutline}
        onConfirm={publish}
        courseHref={`/communities/${slug}/classroom/${courseSlug}`}
      />

      {outlineColumn ? null : (
        <Sheet open={outlineOpen} onOpenChange={setOutlineOpen}>
          <SheetContent side="left" className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{t("outline")}</SheetTitle>
            </SheetHeader>
            {outline}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function BuilderSkeleton() {
  return (
    <div
      aria-busy="true"
      className="flex flex-col lg:h-[calc(100dvh-3rem-1px)]"
    >
      <div className="border-border flex items-center gap-3 border-b px-4 py-3 sm:px-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="ml-auto h-8 w-40" />
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="border-border hidden space-y-2 border-r p-3 lg:block">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
        <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="aspect-[16/5] w-full" />
        </div>
      </div>
    </div>
  );
}
