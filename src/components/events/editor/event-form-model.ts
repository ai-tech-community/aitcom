import type {
  EventFocus,
  EventFormat,
  EventLevel,
  EventType,
} from "@/lib/event-metadata";
import { DEFAULT_EVENT_TIMEZONE } from "@/lib/event-time";
import type { RegistrationQuestion } from "@/lib/events/registration-questions";
import type { ConflictPanelState } from "@/components/events/event-conflict-panel";
import type { RouterOutputs } from "@/trpc/react";

/**
 * The event editor's form model: its state, how it is filled (a new event,
 * an existing one, an imported link) and what it sends. Pure — no React — so
 * every rule here is unit-tested without rendering the page.
 */

/**
 * - `create`: a new event. An admin/owner publishes it; a member submits it
 *   for approval.
 * - `edit`: an admin/owner changes an existing event.
 * - `resubmit`: the submitter fixes a rejected submission and sends it back.
 */
export type EventEditorMode = "create" | "edit" | "resubmit";

export interface EventFormData {
  title: string;
  summary: string;
  description: string;
  type: EventType;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  location: string;
  format: EventFormat | "";
  region: string;
  country: string;
  city: string;
  focus: EventFocus | "";
  level: EventLevel | "";
  // Slugs — the stable public audience vocabulary (CONTEXT.md [[audience]]).
  audience: string[];
  sourceUrl: string;
  aitFitScore: string;
  tags: string;
  curatedByAgent: boolean;
  discoverySource: string;
  confidenceScore: string;
  lastVerifiedAt: string;
  videoUrl: string;
  maxAttendees: string;
  registrationQuestions: RegistrationQuestion[];
  coverImageId: number | null;
  coverImageUrl: string | null;
}

export const emptyEventFormData: EventFormData = {
  title: "",
  summary: "",
  description: "",
  type: "meetup",
  date: "",
  startTime: "",
  endTime: "",
  timezone: "",
  location: "",
  format: "",
  region: "",
  country: "",
  city: "",
  focus: "",
  level: "",
  audience: [],
  sourceUrl: "",
  aitFitScore: "",
  tags: "",
  curatedByAgent: false,
  discoverySource: "",
  confidenceScore: "",
  lastVerifiedAt: "",
  videoUrl: "",
  maxAttendees: "",
  registrationQuestions: [],
  coverImageId: null,
  coverImageUrl: null,
};

/** A new event starts in the organizer's own timezone. */
export function newEventForm(browserTimeZone: string): EventFormData {
  return { ...emptyEventFormData, timezone: browserTimeZone };
}

type EditData = RouterOutputs["events"]["getEventForEdit"];

/** An existing event, as the form edits it. */
export function formFromEditData(data: EditData): EventFormData {
  return {
    ...emptyEventFormData,
    title: data.title,
    summary: data.summary,
    description: data.description,
    type: data.type,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    // Legacy events without a timezone were backfilled to the platform
    // default; stamping the editor's browser zone here would silently shift
    // the event's wall-clock times to wherever the editor happens to be.
    timezone: data.timezone || DEFAULT_EVENT_TIMEZONE,
    location: data.location,
    format: data.format as EventFormat | "",
    region: data.region,
    country: data.country,
    city: data.city,
    focus: data.focus as EventFocus | "",
    level: data.level as EventLevel | "",
    audience: data.audience.map((a) => a.slug),
    sourceUrl: data.sourceUrl,
    aitFitScore: data.aitFitScore,
    tags: data.tags,
    curatedByAgent: data.curatedByAgent,
    discoverySource: data.discoverySource,
    confidenceScore: data.confidenceScore,
    lastVerifiedAt: data.lastVerifiedAt,
    videoUrl: data.videoUrl,
    maxAttendees: data.maxAttendees,
    registrationQuestions: data.registrationQuestions,
    coverImageId: data.coverImageId,
    coverImageUrl: data.coverImageUrl,
  };
}

type ImportData = RouterOutputs["events"]["importEventFromUrl"];

/** What an imported link found fills the form; what it did not keeps its value. */
export function applyImport(
  form: EventFormData,
  data: ImportData,
): EventFormData {
  return {
    ...form,
    title: data.title ?? form.title,
    summary: data.summary ?? form.summary,
    description: data.description ?? form.description,
    date: data.date ?? form.date,
    startTime: data.startTime ?? form.startTime,
    endTime: data.endTime ?? form.endTime,
    location: data.location ?? form.location,
    city: data.city ?? form.city,
    country: data.country ?? form.country,
    format: data.format ?? form.format,
    sourceUrl: data.sourceUrl ?? form.sourceUrl,
    coverImageId: data.coverImageId ?? form.coverImageId,
    coverImageUrl: data.coverImageUrl ?? form.coverImageUrl,
  };
}

/**
 * Maps form state to the `createEvent`/`updateEvent`/`resubmitEvent`
 * mutation payload.
 *
 * #210: an edit/resubmit must be able to send `audience: []` as an explicit
 * "clear every audience". Create keeps omit-when-empty: the server requires
 * at least one audience on create, so an empty array there is a validation
 * error, never an intentional clear. Registration questions are always sent:
 * `[]` is how an organizer removes them all.
 */
export function buildEventSubmitPayload(
  form: EventFormData,
  mode: EventEditorMode,
  communitySlug: string,
) {
  const isEditingMode = mode === "edit" || mode === "resubmit";
  const parsedTags = form.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    communitySlug,
    title: form.title,
    summary: form.summary || undefined,
    description: form.description || undefined,
    type: form.type,
    date: form.date,
    startTime: form.startTime || undefined,
    endTime: form.endTime || undefined,
    timezone: form.timezone || undefined,
    location: form.location,
    format: form.format || undefined,
    region: form.region || undefined,
    country: form.country || undefined,
    city: form.city || undefined,
    focus: form.focus || undefined,
    level: form.level || undefined,
    audience: isEditingMode
      ? form.audience
      : form.audience.length
        ? form.audience
        : undefined,
    sourceUrl: form.sourceUrl || undefined,
    aitFitScore: form.aitFitScore ? parseInt(form.aitFitScore, 10) : undefined,
    tags: parsedTags.length ? parsedTags : undefined,
    curatedByAgent: form.curatedByAgent,
    discoverySource: form.discoverySource || undefined,
    confidenceScore: form.confidenceScore
      ? parseFloat(form.confidenceScore)
      : undefined,
    lastVerifiedAt: form.lastVerifiedAt || undefined,
    videoUrl: form.videoUrl || undefined,
    maxAttendees: form.maxAttendees
      ? parseInt(form.maxAttendees, 10)
      : undefined,
    // An event run on another site has no registration here to ask in.
    registrationQuestions: form.sourceUrl ? [] : form.registrationQuestions,
    // number = keep/replace, null = clear (server clears on null, leaves on undefined)
    coverImage: form.coverImageId,
  };
}

/**
 * The conflict panel's display state. `debouncePending` must win over a
 * leftover `conflictCount`/`isError` from the *previous* debounced input,
 * otherwise the panel would flash the previous (now stale) result for the
 * whole debounce window instead of "checking".
 */
export function deriveConflictPanelState(params: {
  gateMet: boolean;
  debouncePending: boolean;
  hasDebouncedInput: boolean;
  isFetching: boolean;
  isError: boolean;
  conflictCount: number;
}): ConflictPanelState {
  if (!params.gateMet) return "idle";
  if (params.debouncePending || !params.hasDebouncedInput || params.isFetching)
    return "checking";
  if (params.isError) return "error";
  return params.conflictCount > 0 ? "conflicts" : "clear";
}

/**
 * A user-readable message from a tRPC mutation error: the zod field/form
 * message the router exposes, else the server's own words, else `fallback`.
 */
export function getMutationErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const zod = (
    error as {
      data?: {
        zodError?: {
          fieldErrors?: Record<string, string[] | undefined>;
          formErrors?: string[];
        } | null;
      } | null;
    }
  )?.data?.zodError;
  if (zod) {
    const fieldMessage = Object.values(zod.fieldErrors ?? {})
      .flat()
      .find((m): m is string => Boolean(m));
    if (fieldMessage) return fieldMessage;
    if (zod.formErrors?.[0]) return zod.formErrors[0];
  }
  const message = (error as { message?: unknown })?.message;
  if (
    typeof message === "string" &&
    message.length > 0 &&
    !message.trimStart().startsWith("[")
  ) {
    return message;
  }
  return fallback;
}
