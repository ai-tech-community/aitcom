"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { DEFAULT_EVENT_TIMEZONE } from "@/lib/event-time";
import { api } from "@/trpc/react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { EDITOR_SECTIONS, type EditorSectionId } from "./editor-layout";
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

/**
 * The event editor page body: create, edit or resubmit a community event,
 * in sections instead of one long dialog. The page route has already
 * checked who may open it; the server checks again on save.
 */
export function EventEditor({
  communitySlug,
  mode,
  eventId,
  canPublish,
}: {
  communitySlug: string;
  mode: EventEditorMode;
  eventId?: number;
  /** Community admin/owner: publishes directly and sees curation fields. */
  canPublish: boolean;
}) {
  const t = useTranslations("events");
  const te = useTranslations("events.editor");
  const router = useRouter();
  const backHref = `/communities/${communitySlug}/events`;
  const isEditing = mode !== "create";

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

  if (isEditing && editData.isError) {
    return (
      <ErrorState
        description={te("loadError")}
        onRetry={() => void editData.refetch()}
      />
    );
  }
  if (!form) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const sections = EDITOR_SECTIONS.filter(
    (id: EditorSectionId) =>
      (id !== "import" || mode === "create") &&
      (id !== "curation" || canPublish),
  );

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

  return (
    <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-12">
      <nav aria-label={te("sectionsNav")} className="hidden lg:block">
        <ul className="sticky top-24 space-y-1 text-sm">
          {sections.map((id) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 block rounded-md px-2 py-1.5 outline-none focus-visible:ring-[3px]"
              >
                {te(`sections.${id}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <form onSubmit={onSubmit}>
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
        {canPublish ? <CurationSection form={form} update={update} /> : null}

        <div className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-2 border-t px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          {triedSave && hasQuestionProblems ? (
            <p role="alert" className="text-destructive mr-auto text-sm">
              {te("questions.fixBeforeSaving")}
            </p>
          ) : null}
          <Button asChild variant="ghost">
            <Link href={backHref}>{te("cancel")}</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : null}
            {submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
