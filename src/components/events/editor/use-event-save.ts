"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import {
  buildEventSubmitPayload,
  getMutationErrorMessage,
  type EventEditorMode,
  type EventFormData,
} from "./event-form-model";

/**
 * Saving the editor: which mutation runs depends on the mode and the
 * viewer — an admin/owner creates or edits, a member submits for approval
 * or resubmits a rejected submission. `onSaved` runs after the lists that
 * show the event are refreshed.
 */
export function useEventSave({
  mode,
  communitySlug,
  eventId,
  canPublish,
  onSaved,
}: {
  mode: EventEditorMode;
  communitySlug: string;
  eventId?: number;
  /** Community admin/owner: creates publish directly instead of submitting. */
  canPublish: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("events");
  const utils = api.useUtils();

  const done = (message: string) => {
    toast.success(message);
    void utils.events.getCommunityEvents.invalidate();
    void utils.events.getMyEventSubmissions.invalidate();
    void utils.events.getPendingCommunityEvents.invalidate();
    onSaved();
  };

  const create = api.events.createEvent.useMutation({
    onSuccess: () => done(t("eventCreated")),
    onError: (e) =>
      toast.error(getMutationErrorMessage(e, t("eventCreateError"))),
  });
  const update = api.events.updateEvent.useMutation({
    onSuccess: () => done(t("eventUpdated")),
    onError: (e) =>
      toast.error(getMutationErrorMessage(e, t("eventUpdateError"))),
  });
  const submit = api.events.submitEvent.useMutation({
    onSuccess: () => done(t("eventSubmitted")),
    onError: (e) =>
      toast.error(getMutationErrorMessage(e, t("eventSubmitError"))),
  });
  const resubmit = api.events.resubmitEvent.useMutation({
    onSuccess: () => done(t("eventResubmitted")),
    onError: (e) =>
      toast.error(getMutationErrorMessage(e, t("eventResubmitError"))),
  });

  function save(form: EventFormData) {
    const payload = buildEventSubmitPayload(form, mode, communitySlug);
    if (mode === "resubmit" && eventId)
      resubmit.mutate({ eventId, ...payload });
    else if (mode === "edit" && eventId) update.mutate({ eventId, ...payload });
    else if (canPublish) create.mutate(payload);
    else submit.mutate(payload);
  }

  return {
    save,
    pending:
      create.isPending ||
      update.isPending ||
      submit.isPending ||
      resubmit.isPending,
  };
}
