"use client";

import { useState, useEffect } from "react";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  EVENT_AUDIENCE_LABELS,
  EVENT_AUDIENCE_OPTIONS,
  EVENT_FOCUS_LABELS,
  EVENT_FOCUS_OPTIONS,
  EVENT_FORMAT_LABELS,
  EVENT_FORMAT_OPTIONS,
  EVENT_LEVEL_LABELS,
  EVENT_LEVEL_OPTIONS,
  type EventAudience,
  type EventFocus,
  type EventFormat,
  type EventLevel,
  type EventType,
} from "@/lib/event-metadata";

interface EventFormData {
  title: string;
  summary: string;
  description: string;
  type: EventType;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  format: EventFormat | "";
  region: string;
  country: string;
  city: string;
  focus: EventFocus | "";
  level: EventLevel | "";
  audience: EventAudience[];
  sourceUrl: string;
  aitFitScore: string;
  tags: string;
  curatedByAgent: boolean;
  discoverySource: string;
  confidenceScore: string;
  lastVerifiedAt: string;
  videoUrl: string;
  maxAttendees: string;
}

const emptyForm: EventFormData = {
  title: "",
  summary: "",
  description: "",
  type: "meetup",
  date: "",
  startTime: "",
  endTime: "",
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
};

interface EventFormDialogProps {
  slug: string;
  mode: "create" | "edit";
  eventId?: number;
  initialData?: Partial<EventFormData>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdminOrOwner?: boolean;
}

export function EventFormDialog({
  slug,
  mode,
  eventId,
  initialData,
  open,
  onOpenChange,
  isAdminOrOwner = false,
}: EventFormDialogProps) {
  const t = useTranslations("events");
  const utils = api.useUtils();
  const [form, setForm] = useState<EventFormData>(emptyForm);

  useEffect(() => {
    if (open && initialData) {
      setForm({
        ...emptyForm,
        ...initialData,
        audience: initialData.audience ?? [],
      });
    } else if (open && mode === "create") {
      setForm(emptyForm);
    }
  }, [open, initialData, mode]);

  const createMutation = api.events.createEvent.useMutation({
    onSuccess: () => {
      toast.success(t("eventCreated"));
      onOpenChange(false);
      void utils.events.getCommunityEvents.invalidate();
    },
    onError: () => toast.error(t("eventCreateError")),
  });

  const updateMutation = api.events.updateEvent.useMutation({
    onSuccess: () => {
      toast.success(t("eventUpdated"));
      onOpenChange(false);
      void utils.events.getCommunityEvents.invalidate();
    },
    onError: () => toast.error("Failed to update event"),
  });

  const submitMutation = api.events.submitEvent.useMutation({
    onSuccess: () => {
      toast.success("Event submitted for approval");
      onOpenChange(false);
      void utils.events.getCommunityEvents.invalidate();
      void utils.events.getMyEventSubmissions.invalidate();
    },
    onError: () => toast.error("Failed to submit event"),
  });

  const parsedTags = form.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const payload = {
    communitySlug: slug,
    title: form.title,
    summary: form.summary || undefined,
    description: form.description || undefined,
    type: form.type,
    date: form.date,
    startTime: form.startTime || undefined,
    endTime: form.endTime || undefined,
    location: form.location,
    format: form.format || undefined,
    region: form.region || undefined,
    country: form.country || undefined,
    city: form.city || undefined,
    focus: form.focus || undefined,
    level: form.level || undefined,
    audience: form.audience.length ? form.audience : undefined,
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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "edit" && eventId) {
      updateMutation.mutate({ eventId, ...payload });
    } else if (isAdminOrOwner) {
      createMutation.mutate(payload);
    } else {
      submitMutation.mutate(payload);
    }
  };

  const toggleAudience = (value: EventAudience) => {
    setForm((current) => ({
      ...current,
      audience: current.audience.includes(value)
        ? current.audience.filter((entry) => entry !== value)
        : [...current.audience, value],
    }));
  };

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    submitMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("createEvent") : t("editEvent")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
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
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                rows={2}
                maxLength={1000}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="event-description">{t("eventDescription")}</Label>
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
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-end">{t("eventEndTime")}</Label>
              <Input
                id="event-end"
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="event-location">{t("eventLocation")}</Label>
              <Input
                id="event-location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
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
                onChange={(e) => setForm({ ...form, country: e.target.value })}
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
                {EVENT_AUDIENCE_OPTIONS.map((value) => {
                  const active = form.audience.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleAudience(value)}
                      className={`rounded border px-3 py-1 text-sm ${active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}
                    >
                      {EVENT_AUDIENCE_LABELS[value]}
                    </button>
                  );
                })}
              </div>
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
                <Label htmlFor="event-discovery-source">Discovery source</Label>
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
                onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
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

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {mode === "edit"
                  ? "Saving..."
                  : isAdminOrOwner
                    ? t("creating")
                    : "Submitting..."}
              </>
            ) : mode === "edit" ? (
              t("editEvent")
            ) : isAdminOrOwner ? (
              t("createEvent")
            ) : (
              "Submit for Approval"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
