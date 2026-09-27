"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Archive } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api, type RouterOutputs } from "@/trpc/react";
import { cn } from "@/lib/utils";
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
import { CourseView } from "@/components/classroom/course-view";
import { BuilderTopBar } from "./builder-top-bar";
import { CourseDetailsPane } from "./course-details-pane";
import { builderErrorKey } from "./builder-errors";
import { createCourseWriter } from "./course-writer";
import { buildOutline, type OutlineGroup } from "./outline-model";
import { useUnsavedChangesGuard, type AutosaveStatus } from "./use-autosave";

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
  const [writer] = useState(() => createCourseWriter(course.updatedAt));

  const searchParams = useSearchParams();
  const selection = resolveSelection(searchParams.get("lesson"), lessons);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);

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
  /**
   * Flush every pane, then say whether it is safe to act on the saved course.
   * If not, show the problem: open the details pane when it is the one
   * holding unsaved work, and explain in a toast.
   */
  const saveAllFirst = useCallback(async (): Promise<boolean> => {
    const results = await Promise.all(
      Object.entries(paneStatesRef.current).map(
        async ([key, pane]) => [key, await pane.flush()] as const,
      ),
    );
    if (canLeaveEditing(results.map(([, status]) => status))) return true;
    if (
      results.some(([key, status]) => key === "details" && UNSAFE.has(status))
    ) {
      select({ kind: "details" });
    }
    toast.error(t("finishSavingFirst"));
    return false;
  }, [select, t]);

  const save = combineSaveStates(Object.values(paneStates));
  useUnsavedChangesGuard(UNSAFE.has(save.status));

  const [statusChanging, setStatusChanging] = useState(false);
  const changeStatus = async (next: "draft" | "published") => {
    setStatusChanging(true);
    try {
      if (!(await saveAllFirst())) return;
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
    } catch (err) {
      const code = err instanceof Error ? err.message : undefined;
      if (code === "COURSE_CHANGED") reportPane("status", STATUS_CONFLICT);
      else toast.error(t(builderErrorKey(code)));
    } finally {
      setStatusChanging(false);
    }
  };

  const togglePreview = async () => {
    if (!previewing && !(await saveAllFirst())) return;
    setPreviewing((p) => !p);
  };

  const groups = useMemo(
    () =>
      buildOutline(
        lessons.map((l) => ({
          id: l.id,
          title: l.title,
          module: l.module ?? null,
          order: l.order ?? 0,
        })),
        modules,
      ),
    [lessons, modules],
  );
  const lessonTitles = useMemo(
    () => new Map(lessons.map((l) => [l.id, l.title])),
    [lessons],
  );

  const outline = (
    <OutlineList
      groups={groups}
      lessonTitles={lessonTitles}
      selection={selection}
      onSelect={select}
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
        savedAt={save.savedAt}
        onRetry={() => void save.retry()}
        onReload={() => void onReload()}
        previewing={previewing}
        onTogglePreview={() => void togglePreview()}
        onPublish={() => void changeStatus("published")}
        onUnpublish={() => void changeStatus("draft")}
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
          "grid min-h-0 flex-1 lg:grid-cols-[18rem_minmax(0,1fr)]",
          previewing && "hidden",
        )}
      >
        <nav
          aria-label={t("outline")}
          className="border-border hidden overflow-y-auto border-r lg:block"
        >
          <SectionLabel className="mx-3 mt-4">{t("outline")}</SectionLabel>
          {outline}
        </nav>

        <div className="min-w-0 overflow-y-auto">
          <div hidden={selection.kind !== "details"}>
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
          {selection.kind === "lesson" ? (
            <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
              <EmptyState
                title={lessonTitles.get(selection.lessonId)}
                description={t("lessonPanePending")}
              />
            </div>
          ) : null}
        </div>
      </div>

      <Sheet open={outlineOpen} onOpenChange={setOutlineOpen}>
        <SheetContent side="left" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("outline")}</SheetTitle>
          </SheetHeader>
          {outline}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function OutlineList({
  groups,
  lessonTitles,
  selection,
  onSelect,
}: {
  groups: OutlineGroup[];
  lessonTitles: ReadonlyMap<number, string>;
  selection: BuilderSelection;
  onSelect: (next: BuilderSelection) => void;
}) {
  const t = useTranslations("classroomBuilder");
  const hasLessons = groups.some((g) => g.lessonIds.length > 0);

  return (
    <div className="space-y-4 p-3">
      <OutlineRow
        active={selection.kind === "details"}
        onClick={() => onSelect({ kind: "details" })}
      >
        {t("courseDetails")}
      </OutlineRow>

      {hasLessons ? (
        groups.map((group) => (
          <div key={group.moduleId ?? "loose"} className="space-y-1">
            {group.title ? (
              <p className="text-muted-foreground truncate px-2 text-xs font-medium">
                {group.title}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {group.lessonIds.map((id) => (
                <li key={id}>
                  <OutlineRow
                    active={
                      selection.kind === "lesson" && selection.lessonId === id
                    }
                    onClick={() => onSelect({ kind: "lesson", lessonId: id })}
                  >
                    {lessonTitles.get(id)}
                  </OutlineRow>
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <p className="text-muted-foreground px-2 text-sm">{t("noLessons")}</p>
      )}
    </div>
  );
}

function OutlineRow({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "focus-visible:ring-ring/50 block w-full truncate rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-[3px]",
        active
          ? "bg-secondary text-foreground font-medium"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
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
