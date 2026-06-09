"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/article-editor/rich-text-editor";
import { ExamEditor, type ExamDraft } from "./exam-editor";
import type { ExamQuestion } from "@/lib/classroom";
import { Pencil, Trash2, Plus, X } from "lucide-react";

interface ResourceRow {
  label: string;
  url: string;
}

interface LessonLike {
  id: number;
  title: string;
  order?: number | null;
  youtubeUrl?: string | null;
  body?: unknown;
  resources?: ResourceRow[] | null;
  examMandatory?: boolean | null;
  examPassThreshold?: number | null;
  examMaxAttempts?: number | null;
  examQuestions?: unknown;
}

/** A row-based editor for a lesson's resource links ({label,url}). */
function ResourcesEditor({
  resources,
  onChange,
  disabled,
}: {
  resources: ResourceRow[];
  onChange: (next: ResourceRow[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("classroom");
  const update = (i: number, patch: Partial<ResourceRow>) =>
    onChange(resources.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-2">
      <Label>{t("resources")}</Label>
      {resources.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            className="flex-1"
            value={row.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder={t("resourceLabel")}
            maxLength={120}
            disabled={disabled}
          />
          <Input
            className="flex-2"
            value={row.url}
            onChange={(e) => update(i, { url: e.target.value })}
            placeholder={t("resourceUrl")}
            maxLength={500}
            disabled={disabled}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => onChange(resources.filter((_, idx) => idx !== i))}
            aria-label={t("removeResource")}
            disabled={disabled}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => onChange([...resources, { label: "", url: "" }])}
        disabled={Boolean(disabled) || resources.length >= 20}
      >
        <Plus className="mr-1.5 size-3.5" /> {t("addResource")}
      </Button>
    </div>
  );
}

/** Shared editable form for a single lesson's fields. */
function LessonFields({
  title,
  setTitle,
  youtubeUrl,
  setYoutubeUrl,
  body,
  setBody,
  resources,
  setResources,
  exam,
  setExam,
  disabled,
}: {
  title: string;
  setTitle: (v: string) => void;
  youtubeUrl: string;
  setYoutubeUrl: (v: string) => void;
  body: unknown;
  setBody: (v: unknown) => void;
  resources: ResourceRow[];
  setResources: (v: ResourceRow[]) => void;
  exam: ExamDraft;
  setExam: (v: ExamDraft) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("classroom");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>{t("lessonTitle")}</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("youtubeUrl")}</Label>
        <Input
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=…"
          maxLength={500}
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("lessonBody")}</Label>
        <div className="border-border rounded-md border px-2 py-2">
          <RichTextEditor
            initialValue={body ?? null}
            onChange={setBody}
            placeholder={t("lessonBodyPlaceholder")}
          />
        </div>
      </div>
      <ResourcesEditor
        resources={resources}
        onChange={setResources}
        disabled={disabled}
      />
      <ExamEditor value={exam} onChange={setExam} disabled={disabled} />
    </div>
  );
}

/** One lesson row with an inline edit/delete affordance. */
function LessonRow({ lesson }: { lesson: LessonLike }) {
  const t = useTranslations("classroom");
  const utils = api.useUtils();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(lesson.title);
  const [youtubeUrl, setYoutubeUrl] = useState(lesson.youtubeUrl ?? "");
  const [body, setBody] = useState<unknown>(lesson.body ?? null);
  const [resources, setResources] = useState<ResourceRow[]>(
    (lesson.resources ?? []).map((r) => ({ label: r.label, url: r.url })),
  );
  const [exam, setExam] = useState<ExamDraft>({
    mandatory: lesson.examMandatory ?? false,
    passThreshold: lesson.examPassThreshold ?? 70,
    maxAttempts: lesson.examMaxAttempts ?? 0,
    questions: (lesson.examQuestions ?? []) as ExamQuestion[],
  });

  const update = api.classrooms.updateLesson.useMutation({
    onSuccess: () => {
      toast.success(t("lessonSaved"));
      setEditing(false);
      void utils.classrooms.get.invalidate();
    },
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });

  const del = api.classrooms.deleteLesson.useMutation({
    onSuccess: () => {
      toast.success(t("lessonDeleted"));
      void utils.classrooms.get.invalidate();
    },
    onError: (err) => toast.error(err.message ?? t("deleteFailed")),
  });

  if (!editing) {
    return (
      <div className="border-border flex items-center justify-between rounded-lg border px-3 py-2">
        <span className="text-muted-foreground mr-2 font-mono text-xs">
          {(lesson.order ?? 0) + 1}
        </span>
        <span className="flex-1 truncate text-sm">{lesson.title}</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setEditing(true)}
            aria-label={t("editLesson")}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => del.mutate({ lessonId: lesson.id })}
            disabled={del.isPending}
            aria-label={t("deleteLesson")}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border space-y-3 rounded-lg border p-3">
      <LessonFields
        title={title}
        setTitle={setTitle}
        youtubeUrl={youtubeUrl}
        setYoutubeUrl={setYoutubeUrl}
        body={body}
        setBody={setBody}
        resources={resources}
        setResources={setResources}
        exam={exam}
        setExam={setExam}
        disabled={update.isPending}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() =>
            update.mutate({
              lessonId: lesson.id,
              title: title.trim(),
              youtubeUrl: youtubeUrl.trim() ? youtubeUrl.trim() : null,
              body,
              resources: resources.filter(
                (r) => r.label.trim() && r.url.trim(),
              ),
              examMandatory: exam.mandatory,
              examPassThreshold: exam.passThreshold,
              examMaxAttempts: exam.maxAttempts,
              examQuestions: exam.questions,
            })
          }
          disabled={update.isPending || !title.trim()}
        >
          {t("save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={update.isPending}
        >
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

/** Lessons section for the course editor: existing lessons + an "add lesson" form. */
export function LessonEditor({
  courseId,
  lessons,
}: {
  courseId: number;
  lessons: LessonLike[];
}) {
  const t = useTranslations("classroom");
  const utils = api.useUtils();
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [body, setBody] = useState<unknown>(null);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [exam, setExam] = useState<ExamDraft>({
    mandatory: false,
    passThreshold: 70,
    maxAttempts: 0,
    questions: [],
  });

  const add = api.classrooms.addLesson.useMutation({
    onSuccess: () => {
      toast.success(t("lessonSaved"));
      setTitle("");
      setYoutubeUrl("");
      setBody(null);
      setResources([]);
      setExam({
        mandatory: false,
        passThreshold: 70,
        maxAttempts: 0,
        questions: [],
      });
      void utils.classrooms.get.invalidate();
    },
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">{t("lessons")}</h2>

      {lessons.length > 0 ? (
        <div className="space-y-2">
          {lessons.map((lesson) => (
            <LessonRow key={lesson.id} lesson={lesson} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t("noLessons")}</p>
      )}

      <div className="border-border space-y-3 rounded-lg border border-dashed p-3">
        <h3 className="text-sm font-medium">{t("addLesson")}</h3>
        <LessonFields
          title={title}
          setTitle={setTitle}
          youtubeUrl={youtubeUrl}
          setYoutubeUrl={setYoutubeUrl}
          body={body}
          setBody={setBody}
          resources={resources}
          setResources={setResources}
          exam={exam}
          setExam={setExam}
          disabled={add.isPending}
        />
        <Button
          type="button"
          size="sm"
          onClick={() =>
            add.mutate({
              courseId,
              title: title.trim(),
              youtubeUrl: youtubeUrl.trim() ? youtubeUrl.trim() : undefined,
              body: body ?? undefined,
              resources: resources.filter(
                (r) => r.label.trim() && r.url.trim(),
              ),
              examMandatory: exam.mandatory,
              examPassThreshold: exam.passThreshold,
              examMaxAttempts: exam.maxAttempts,
              examQuestions: exam.questions,
            })
          }
          disabled={add.isPending || !title.trim()}
        >
          <Plus className="mr-1.5 size-4" /> {t("addLesson")}
        </Button>
      </div>
    </div>
  );
}
