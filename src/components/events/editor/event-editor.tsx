"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { DEFAULT_EVENT_TIMEZONE } from "@/lib/event-time";
import { api } from "@/trpc/react";
import { useRouter } from "@/i18n/navigation";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { editorChecklist, finishedSections } from "./editor-checklist";
import { EDITOR_SECTIONS, type EditorSectionId } from "./editor-layout";
import { EditorSectionNav } from "./editor-section-nav";
import { EditorSummaryPane } from "./editor-summary-pane";
import { EditorTopBar } from "./editor-top-bar";
import {
  formFromEditData,
  newEventForm,
  type EventEditorMode,
  type EventFormData,
} from "./event-form-model";
import { questionProblems } from "./questions-editor-model";
import { AudienceSection } from "./sections/audience-section";
import { BasicsSection } from "./sections/basics-section";
import { CurationSection } from "./sections/curation-section";
import { ImportSection } from "./sections/import-section";
import { RegistrationSection } from "./sections/registration-section";
import { WhenSection } from "./sections/when-section";
import { WhereSection } from "./sections/where-section";
import { useEventConflicts } from "./use-event-conflicts";
import { useEventSave } from "./use-event-save";

function browserTimeZone(): string {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_EVENT_TIMEZONE
    );
  } catch {
    return DEFAULT_EVENT_TIMEZONE;
  }
}

const FORM_ID = "event-editor-form";

/**
 * The event editor: create, edit or resubmit a community event. A
 * full-screen workspace like the course builder — a top bar with the one
 * orange action, the section menu on the left, the form in the middle
 * (scrolling on its own), and on wide screens a right pane with what is
 * still missing and a live preview. The page route has already checked who
 * may open it; the server checks again on save.
 */
export function EventEditor({
  communitySlug,
  communityName,
  mode,
  eventId,
  canPublish,
  title,
  subtitle,
}: {
  communitySlug: string;
  communityName: string;
  mode: EventEditorMode;
  eventId?: number;
  /** Community admin/owner: publishes directly and sees curation fields. */
  canPublish: boolean;
  title: string;
  subtitle?: string;
}) {
  const t = useTranslations("events");
  const te = useTranslations("events.editor");
  const router = useRouter();
  const backHref = `/communities/${communitySlug}/events`;
  const isEditing = mode !== "create";
  const scrollRef = useRef<HTMLDivElement>(null);

  const editData = api.events.getEventForEdit.useQuery(
    { eventId: eventId ?? 0, communitySlug },
    { enabled: isEditing && !!eventId },
  );

  const [form, setForm] = useState<EventFormData | null>(
    isEditing ? null : () => newEventForm(browserTimeZone()),
  );
  useEffect(() => {
    if (isEditing && editData.data && form === null) {
      setForm(formFromEditData(editData.data));
    }
  }, [isEditing, editData.data, form]);

  const update = (patch: Partial<EventFormData>) =>
    setForm((current) => (current ? { ...current, ...patch } : current));

  const conflicts = useEventConflicts({
    form: form ?? newEventForm(DEFAULT_EVENT_TIMEZONE),
    enabled: form !== null,
    excludeEventId: isEditing ? eventId : undefined,
    onApplySlot: (slot) => update(slot),
  });

  const { save, pending } = useEventSave({
    mode,
    communitySlug,
    eventId,
    canPublish,
    onSaved: () => router.push(backHref),
  });

  const [triedSave, setTriedSave] = useState(false);
  const problems = form ? questionProblems(form.registrationQuestions) : {};
  const hasQuestionProblems =
    !form?.sourceUrl.trim() && Object.keys(problems).length > 0;

  // Stable per mode/role: the section menu watches these elements.
  const sections = useMemo(
    () =>
      EDITOR_SECTIONS.filter(
        (id: EditorSectionId) =>
          (id !== "import" || mode === "create") &&
          (id !== "curation" || canPublish),
      ),
    [mode, canPublish],
  );
  const checklist = form ? editorChecklist(form, mode) : [];
  const finished = finishedSections(checklist);

  const submitLabel =
    mode === "resubmit"
      ? t("resubmitForApproval")
      : mode === "edit"
        ? te("saveChanges")
        : canPublish
          ? t("createEvent")
          : t("submitForApproval");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTriedSave(true);
    if (hasQuestionProblems) {
      document
        .getElementById("registration")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (form) save(form);
  }

  let body: React.ReactNode;
  if (isEditing && editData.isError) {
    body = (
      <div className="p-6">
        <ErrorState
          description={te("loadError")}
          onRetry={() => void editData.refetch()}
        />
      </div>
    );
  } else if (!form) {
    body = (
      <div className="mx-auto max-w-3xl space-y-4 p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else {
    const summary = (
      <EditorSummaryPane
        form={form}
        checklist={checklist}
        communityName={communityName}
      />
    );
    body = (
      <div className="grid min-h-0 flex-1 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
        <aside className="border-border hidden overflow-y-auto border-r lg:block">
          <EditorSectionNav
            sections={sections}
            finished={finished}
            scrollRoot={scrollRef}
          />
        </aside>

        <div ref={scrollRef} className="min-w-0 overflow-y-auto scroll-smooth">
          <form
            id={FORM_ID}
            onSubmit={onSubmit}
            className="mx-auto max-w-3xl px-4 py-8 sm:px-8"
          >
            {triedSave && hasQuestionProblems ? (
              <p
                role="alert"
                className="border-destructive/40 bg-destructive/10 text-destructive mb-6 rounded-md border px-3 py-2 text-sm"
              >
                {te("questions.fixBeforeSaving")}
              </p>
            ) : null}
            {sections.includes("import") ? (
              <ImportSection
                form={form}
                update={update}
                communitySlug={communitySlug}
              />
            ) : null}
            <BasicsSection form={form} update={update} />
            <AudienceSection form={form} update={update} />
            <WhenSection form={form} update={update} conflicts={conflicts} />
            <WhereSection form={form} update={update} />
            <RegistrationSection
              form={form}
              update={update}
              problems={problems}
              showProblems={triedSave}
            />
            {canPublish ? (
              <CurationSection form={form} update={update} />
            ) : null}
          </form>
          {/* Narrower screens: the checklist and preview follow the form. */}
          <div className="border-border mx-auto max-w-3xl border-t xl:hidden">
            {summary}
          </div>
        </div>

        <aside className="border-border hidden overflow-y-auto border-l xl:block">
          {summary}
        </aside>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3rem-1px)]">
      <EditorTopBar
        backHref={backHref}
        backLabel={communityName}
        title={title}
        subtitle={subtitle}
        formId={FORM_ID}
        submitLabel={submitLabel}
        pending={pending || !form}
      />
      {body}
    </div>
  );
}
