"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  EVENT_FOCUS_LABELS,
  EVENT_FOCUS_OPTIONS,
  EVENT_FORMAT_LABELS,
  EVENT_FORMAT_OPTIONS,
  EVENT_LEVEL_LABELS,
  EVENT_LEVEL_OPTIONS,
  type EventFocus,
  type EventFormat,
  type EventLevel,
  type EventType,
} from "@/lib/event-metadata";
import { DEFAULT_EVENT_TIMEZONE } from "@/lib/event-time";
import { cn } from "@/lib/utils";
import {
  EventConflictPanel,
  SlotSuggestionChips,
  type ConflictCheckInput,
  type ConflictPanelState,
  type SlotSuggestionTriple,
} from "@/components/events/event-conflict-panel";

// Debounce delay for the live conflict check — long enough that typing a
// title/summary doesn't spam checkConflicts, short enough to feel live once
// the organizer settles on a date/audience combo.
const CONFLICT_CHECK_DEBOUNCE_MS = 600;

function getBrowserTimeZone(): string {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_EVENT_TIMEZONE
    );
  } catch {
    return DEFAULT_EVENT_TIMEZONE;
  }
}

function getTimeZoneOptions(current: string): string[] {
  let zones: string[];
  try {
    zones = [...Intl.supportedValuesOf("timeZone")];
  } catch {
    zones = [DEFAULT_EVENT_TIMEZONE];
  }
  if (current && !zones.includes(current)) zones = [current, ...zones];
  return zones;
}

/**
 * Pull a user-readable message out of a tRPC mutation error. Surfaces zod
 * field/form validation messages (exposed via the router's errorFormatter)
 * instead of swallowing them behind a generic toast.
 */
function getMutationErrorMessage(error: unknown, fallback: string): string {
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
  coverImageId: null,
  coverImageUrl: null,
};

interface EventFormDialogProps {
  slug: string;
  mode: "create" | "edit" | "resubmit";
  eventId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdminOrOwner?: boolean;
}

/**
 * Maps form state to the `createEvent`/`updateEvent`/`resubmitEvent` mutation
 * payload shape. Pure and exported so #210 (explicit audience clear on edit)
 * is unit-testable without rendering the dialog — see event-form-dialog.test.tsx.
 *
 * #210: an edit/resubmit must be able to send `audience: []` as an explicit
 * "clear every audience" — the server (I-T1) now honors an empty array on
 * update rather than treating it as "no change". Create (and the initial
 * submit-for-approval flow) keeps omit-when-empty: the server requires at
 * least one audience on create, so an empty array there is a validation
 * error, never an intentional clear.
 */
export function buildEventSubmitPayload(
  form: EventFormData,
  mode: EventFormDialogProps["mode"],
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
    // number = keep/replace, null = clear (server clears on null, leaves on undefined)
    coverImage: form.coverImageId,
  };
}

export function EventFormDialog({
  slug,
  mode,
  eventId,
  open,
  onOpenChange,
  isAdminOrOwner = false,
}: EventFormDialogProps) {
  const t = useTranslations("events");
  const tc = useTranslations("common");
  const utils = api.useUtils();
  const [form, setForm] = useState<EventFormData>(emptyEventFormData);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  const isEditing = mode === "edit" || mode === "resubmit";

  // Edit/resubmit: load the full event record to pre-fill every field. The
  // list rows only carry a few fields, so we fetch the rest here.
  const { data: editData, isLoading: editLoading } =
    api.events.getEventForEdit.useQuery(
      { eventId: eventId ?? 0, communitySlug: slug },
      { enabled: open && isEditing && !!eventId },
    );

  // Audience chip options (slug + display name); public, cacheable.
  const { data: audienceOptions, isLoading: audienceOptionsLoading } =
    api.audiences.list.useQuery(undefined, { enabled: open });

  // Live scheduling-conflict check (I-T2 / #206). The gate mirrors the
  // server's own requirements: checkConflicts needs a date and at least one
  // target audience. The debounced tuple below is the query input; while a
  // debounce is pending (or the query is actively fetching) the panel shows
  // "checking" rather than flashing a stale/empty result.
  const conflictGateMet = !!form.date && form.audience.length >= 1;
  const [debouncedConflictInput, setDebouncedConflictInput] = useState<
    ConflictCheckInput | undefined
  >(undefined);
  const conflictDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (conflictDebounceRef.current) clearTimeout(conflictDebounceRef.current);
    if (!open || !conflictGateMet) {
      setDebouncedConflictInput(undefined);
      return;
    }
    // While the edit payload loads the dialog shows only a spinner and `form`
    // still holds the previous open's values — don't schedule a check for a
    // form the user can't see yet.
    if (isEditing && editLoading) return;
    conflictDebounceRef.current = setTimeout(() => {
      setDebouncedConflictInput({
        date: form.date,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        timezone: form.timezone || undefined,
        format: (form.format || "online") as ConflictCheckInput["format"],
        // No lat/long in this form — geocoding is server-side only.
        city: form.city || undefined,
        audience: form.audience,
        excludeEventId: isEditing ? eventId : undefined,
      });
    }, CONFLICT_CHECK_DEBOUNCE_MS);
    return () => {
      if (conflictDebounceRef.current)
        clearTimeout(conflictDebounceRef.current);
    };
  }, [
    open,
    conflictGateMet,
    editLoading,
    form.date,
    form.startTime,
    form.endTime,
    form.timezone,
    form.format,
    form.city,
    form.audience,
    isEditing,
    eventId,
  ]);

  const conflictCheck = api.events.checkConflicts.useQuery(
    debouncedConflictInput ?? { date: "", audience: [], format: "online" },
    { enabled: open && !!debouncedConflictInput, retry: 1 },
  );

  const conflictPanelState: ConflictPanelState = !conflictGateMet
    ? "idle"
    : !debouncedConflictInput || conflictCheck.isFetching
      ? "checking"
      : conflictCheck.isError
        ? "error"
        : (conflictCheck.data?.conflicts.length ?? 0) > 0
          ? "conflicts"
          : "clear";

  // T3 (#207): applying a suggested slot writes the three fields, then
  // briefly rings the date/start/end inputs so the organizer sees exactly
  // what changed — the debounced conflict check re-runs on its own once
  // `form.date`/`form.startTime`/`form.endTime` settle, same as manual edits.
  const [slotApplyFlash, setSlotApplyFlash] = useState(false);
  const slotApplyFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (slotApplyFlashTimeoutRef.current)
        clearTimeout(slotApplyFlashTimeoutRef.current);
    };
  }, []);

  const applySuggestion = (slot: SlotSuggestionTriple) => {
    setForm((current) => ({
      ...current,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }));
    if (slotApplyFlashTimeoutRef.current)
      clearTimeout(slotApplyFlashTimeoutRef.current);
    setSlotApplyFlash(true);
    slotApplyFlashTimeoutRef.current = setTimeout(
      () => setSlotApplyFlash(false),
      1000,
    );
  };

  const slotApplyFlashClass = slotApplyFlash
    ? "ring-success/60 ring-2 transition-shadow duration-200 motion-reduce:transition-none"
    : "";

  useEffect(() => {
    if (!open) return;
    if (isEditing) {
      if (!editData) return;
      setForm({
        ...emptyEventFormData,
        title: editData.title,
        summary: editData.summary,
        description: editData.description,
        type: editData.type,
        date: editData.date,
        startTime: editData.startTime,
        endTime: editData.endTime,
        // Legacy events without a timezone were backfilled to the platform
        // default; stamping the editor's browser zone here would silently
        // shift the event's wall-clock times to wherever the editor happens
        // to be. Match the backfill instead.
        timezone: editData.timezone || DEFAULT_EVENT_TIMEZONE,
        location: editData.location,
        format: editData.format as EventFormat | "",
        region: editData.region,
        country: editData.country,
        city: editData.city,
        focus: editData.focus as EventFocus | "",
        level: editData.level as EventLevel | "",
        // `getEventForEdit` already maps the populated relationship down to
        // { slug, name }[]; the form only needs the slugs.
        audience: editData.audience.map((a) => a.slug),
        sourceUrl: editData.sourceUrl,
        aitFitScore: editData.aitFitScore,
        tags: editData.tags,
        curatedByAgent: editData.curatedByAgent,
        discoverySource: editData.discoverySource,
        confidenceScore: editData.confidenceScore,
        lastVerifiedAt: editData.lastVerifiedAt,
        videoUrl: editData.videoUrl,
        maxAttendees: editData.maxAttendees,
        coverImageId: editData.coverImageId,
        coverImageUrl: editData.coverImageUrl,
      });
    } else {
      // New events default their timezone from the organizer's browser —
      // geocoding (Nominatim) can't tell us the zone, so the organizer's own
      // zone is the best available signal. They can still override it below.
      setForm({ ...emptyEventFormData, timezone: getBrowserTimeZone() });
      setImportUrl("");
    }
  }, [open, isEditing, editData]);

  const createMutation = api.events.createEvent.useMutation({
    onSuccess: () => {
      toast.success(t("eventCreated"));
      onOpenChange(false);
      void utils.events.getCommunityEvents.invalidate();
    },
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, t("eventCreateError"))),
  });

  const updateMutation = api.events.updateEvent.useMutation({
    onSuccess: () => {
      toast.success(t("eventUpdated"));
      onOpenChange(false);
      void utils.events.getCommunityEvents.invalidate();
    },
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, "Failed to update event")),
  });

  const submitMutation = api.events.submitEvent.useMutation({
    onSuccess: () => {
      toast.success(t("eventSubmitted"));
      onOpenChange(false);
      void utils.events.getCommunityEvents.invalidate();
      void utils.events.getMyEventSubmissions.invalidate();
    },
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, "Failed to submit event")),
  });

  const resubmitMutation = api.events.resubmitEvent.useMutation({
    onSuccess: () => {
      toast.success(t("eventResubmitted"));
      onOpenChange(false);
      void utils.events.getMyEventSubmissions.invalidate();
      void utils.events.getPendingCommunityEvents.invalidate();
    },
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, "Failed to resubmit event")),
  });

  const payload = buildEventSubmitPayload(form, mode, slug);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "resubmit" && eventId) {
      resubmitMutation.mutate({ eventId, ...payload });
    } else if (mode === "edit" && eventId) {
      updateMutation.mutate({ eventId, ...payload });
    } else if (isAdminOrOwner) {
      createMutation.mutate(payload);
    } else {
      submitMutation.mutate(payload);
    }
  };

  const toggleAudience = (value: string) => {
    setForm((current) => ({
      ...current,
      audience: current.audience.includes(value)
        ? current.audience.filter((entry) => entry !== value)
        : [...current.audience, value],
    }));
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("alt", form.title || "Event cover");
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = (await res.json()) as { url: string; id: number };
      setForm((current) => ({
        ...current,
        coverImageId: data.id,
        coverImageUrl: data.url,
      }));
    } catch {
      toast.error(tc("imageUploadFailed"));
    } finally {
      setCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const [importUrl, setImportUrl] = useState("");

  const importMutation = api.events.importEventFromUrl.useMutation({
    onSuccess: (data) => {
      setForm((current) => ({
        ...current,
        title: data.title ?? current.title,
        summary: data.summary ?? current.summary,
        description: data.description ?? current.description,
        date: data.date ?? current.date,
        startTime: data.startTime ?? current.startTime,
        endTime: data.endTime ?? current.endTime,
        location: data.location ?? current.location,
        city: data.city ?? current.city,
        country: data.country ?? current.country,
        format: data.format ?? current.format,
        sourceUrl: data.sourceUrl ?? current.sourceUrl,
        coverImageId: data.coverImageId ?? current.coverImageId,
        coverImageUrl: data.coverImageUrl ?? current.coverImageUrl,
      }));
      toast.success(t("eventImported"));
    },
    onError: (error) => toast.error(error.message),
  });

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    submitMutation.isPending ||
    resubmitMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "resubmit"
              ? "Edit & Resubmit"
              : mode === "create"
                ? t("createEvent")
                : t("editEvent")}
          </DialogTitle>
        </DialogHeader>
        {isEditing && editLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {mode === "create" && (
              <div className="border-border bg-secondary/30 space-y-2 rounded-lg border p-3">
                <Label htmlFor="event-import-url">
                  Import from a link (Meetup, Eventbrite, Luma)
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="event-import-url"
                    type="url"
                    placeholder="https://lu.ma/your-event"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!importUrl || importMutation.isPending}
                    onClick={() =>
                      importMutation.mutate({
                        communitySlug: slug,
                        url: importUrl,
                      })
                    }
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    {importMutation.isPending ? "Importing..." : "Import"}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  We&apos;ll pre-fill what we can find. You can edit everything
                  before submitting.
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="event-title">{t("eventTitle")}</Label>
                <Input
                  id="event-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  minLength={3}
                  maxLength={255}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="event-summary">Summary</Label>
                <Textarea
                  id="event-summary"
                  value={form.summary}
                  onChange={(e) =>
                    setForm({ ...form, summary: e.target.value })
                  }
                  rows={2}
                  maxLength={1000}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="event-description">
                  {t("eventDescription")}
                </Label>
                <Textarea
                  id="event-description"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  rows={4}
                  maxLength={5000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-type">{t("eventType")}</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm({ ...form, type: v as EventType })
                  }
                >
                  <SelectTrigger id="event-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meetup">Meetup</SelectItem>
                    <SelectItem value="workshop">Workshop</SelectItem>
                    <SelectItem value="hackathon">Hackathon</SelectItem>
                    <SelectItem value="deep_dive">Deep Dive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-date">{t("eventDate")}</Label>
                <Input
                  id="event-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                  className={cn(slotApplyFlashClass)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-start">{t("eventStartTime")}</Label>
                <Input
                  id="event-start"
                  type="time"
                  value={form.startTime}
                  onChange={(e) =>
                    setForm({ ...form, startTime: e.target.value })
                  }
                  className={cn(slotApplyFlashClass)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-end">{t("eventEndTime")}</Label>
                <Input
                  id="event-end"
                  type="time"
                  value={form.endTime}
                  onChange={(e) =>
                    setForm({ ...form, endTime: e.target.value })
                  }
                  className={cn(slotApplyFlashClass)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-timezone">{t("eventTimezone")}</Label>
                <Select
                  value={form.timezone || DEFAULT_EVENT_TIMEZONE}
                  onValueChange={(v) => setForm({ ...form, timezone: v })}
                >
                  <SelectTrigger id="event-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getTimeZoneOptions(form.timezone).map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  {t("eventTimezoneHint")}
                </p>
              </div>
              <EventConflictPanel
                state={conflictPanelState}
                conflicts={conflictCheck.data?.conflicts ?? []}
                checkedAudiences={conflictCheck.data?.checkedAudiences ?? []}
                onRetry={() => void conflictCheck.refetch()}
              >
                {/* SlotSuggestionChips itself renders null when there are no
                    suggestions; the panel only mounts `children` inside its
                    "conflicts" frame, so this stays out of the other states. */}
                <SlotSuggestionChips
                  suggestions={conflictCheck.data?.suggestions ?? []}
                  checkedAudiences={conflictCheck.data?.checkedAudiences ?? []}
                  timezone={form.timezone || DEFAULT_EVENT_TIMEZONE}
                  onApply={applySuggestion}
                />
              </EventConflictPanel>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="event-location">{t("eventLocation")}</Label>
                <Input
                  id="event-location"
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  required
                  maxLength={255}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-format">Format</Label>
                <Select
                  value={form.format || "__none"}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      format: v === "__none" ? "" : (v as EventFormat),
                    })
                  }
                >
                  <SelectTrigger id="event-format">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {EVENT_FORMAT_OPTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {EVENT_FORMAT_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-max">{t("eventMaxAttendees")}</Label>
                <Input
                  id="event-max"
                  type="number"
                  min={1}
                  value={form.maxAttendees}
                  onChange={(e) =>
                    setForm({ ...form, maxAttendees: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-region">Region</Label>
                <Input
                  id="event-region"
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                  maxLength={255}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-country">Country</Label>
                <Input
                  id="event-country"
                  value={form.country}
                  onChange={(e) =>
                    setForm({ ...form, country: e.target.value })
                  }
                  maxLength={255}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="event-city">City</Label>
                <Input
                  id="event-city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  maxLength={255}
                />
              </div>
            </div>

            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="event-focus">Focus</Label>
                <Select
                  value={form.focus || "__none"}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      focus: v === "__none" ? "" : (v as EventFocus),
                    })
                  }
                >
                  <SelectTrigger id="event-focus">
                    <SelectValue placeholder="Select focus" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {EVENT_FOCUS_OPTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {EVENT_FOCUS_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-level">Level</Label>
                <Select
                  value={form.level || "__none"}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      level: v === "__none" ? "" : (v as EventLevel),
                    })
                  }
                >
                  <SelectTrigger id="event-level">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {EVENT_LEVEL_OPTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {EVENT_LEVEL_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isAdminOrOwner && (
                <div className="space-y-2">
                  <Label htmlFor="event-score">AIT fit score</Label>
                  <Input
                    id="event-score"
                    type="number"
                    min={1}
                    max={10}
                    value={form.aitFitScore}
                    onChange={(e) =>
                      setForm({ ...form, aitFitScore: e.target.value })
                    }
                  />
                </div>
              )}
              {isAdminOrOwner && (
                <div className="space-y-2">
                  <Label htmlFor="event-confidence">Confidence score</Label>
                  <Input
                    id="event-confidence"
                    type="number"
                    min={0}
                    max={1}
                    step="0.1"
                    value={form.confidenceScore}
                    onChange={(e) =>
                      setForm({ ...form, confidenceScore: e.target.value })
                    }
                  />
                </div>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label>Audience</Label>
                <div className="flex flex-wrap gap-2">
                  {audienceOptionsLoading ? (
                    <>
                      <Skeleton className="h-7 w-20" />
                      <Skeleton className="h-7 w-24" />
                      <Skeleton className="h-7 w-16" />
                    </>
                  ) : (
                    (audienceOptions ?? []).map(({ slug, name }) => {
                      const active = form.audience.includes(slug);
                      return (
                        <button
                          key={slug}
                          type="button"
                          onClick={() => toggleAudience(slug)}
                          className={`rounded border px-3 py-1 text-sm ${active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}
                        >
                          {name}
                        </button>
                      );
                    })
                  )}
                </div>
                {!conflictGateMet && (
                  <p className="text-muted-foreground text-xs">
                    {t("conflictHintIncomplete")}
                  </p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="event-tags">Tags</Label>
                <Input
                  id="event-tags"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="ai, llm, agents"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-source">Source URL</Label>
                <Input
                  id="event-source"
                  type="url"
                  value={form.sourceUrl}
                  onChange={(e) =>
                    setForm({ ...form, sourceUrl: e.target.value })
                  }
                  placeholder="https://..."
                />
              </div>
              {isAdminOrOwner && (
                <div className="space-y-2">
                  <Label htmlFor="event-discovery-source">
                    Discovery source
                  </Label>
                  <Input
                    id="event-discovery-source"
                    value={form.discoverySource}
                    onChange={(e) =>
                      setForm({ ...form, discoverySource: e.target.value })
                    }
                    placeholder="luma, meetup, linkedin"
                  />
                </div>
              )}
              {isAdminOrOwner && (
                <div className="space-y-2">
                  <Label htmlFor="event-last-verified">Last verified at</Label>
                  <Input
                    id="event-last-verified"
                    type="datetime-local"
                    value={form.lastVerifiedAt}
                    onChange={(e) =>
                      setForm({ ...form, lastVerifiedAt: e.target.value })
                    }
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="event-video">Video URL</Label>
                <Input
                  id="event-video"
                  type="url"
                  value={form.videoUrl}
                  onChange={(e) =>
                    setForm({ ...form, videoUrl: e.target.value })
                  }
                  placeholder="https://youtube.com/..."
                />
              </div>
              {isAdminOrOwner && (
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.curatedByAgent}
                    onChange={(e) =>
                      setForm({ ...form, curatedByAgent: e.target.checked })
                    }
                  />
                  <span className="text-sm">Curated by agent</span>
                </label>
              )}
            </div>

            <div className="space-y-2">
              <Label>Cover image</Label>
              {form.coverImageUrl ? (
                <div className="relative w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.coverImageUrl}
                    alt="Event cover preview"
                    className="border-border h-28 rounded-lg border object-cover"
                  />
                  <button
                    type="button"
                    className="bg-background/80 absolute top-1 right-1 rounded-full border p-1"
                    onClick={() =>
                      setForm((c) => ({
                        ...c,
                        coverImageId: null,
                        coverImageUrl: null,
                      }))
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={coverUploading}
                  onClick={() => coverInputRef.current?.click()}
                >
                  {coverUploading ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <ImagePlus className="mr-2 size-4" />
                  )}
                  {coverUploading ? "Uploading..." : "Upload cover image"}
                </Button>
              )}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverUpload}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {mode === "resubmit"
                    ? "Resubmitting..."
                    : mode === "edit"
                      ? "Saving..."
                      : isAdminOrOwner
                        ? t("creating")
                        : "Submitting..."}
                </>
              ) : mode === "resubmit" ? (
                "Resubmit for Approval"
              ) : mode === "edit" ? (
                t("editEvent")
              ) : isAdminOrOwner ? (
                t("createEvent")
              ) : (
                "Submit for Approval"
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
