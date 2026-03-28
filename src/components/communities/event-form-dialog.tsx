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

interface EventFormData {
  title: string;
  description: string;
  type: "workshop" | "hackathon" | "deep_dive" | "meetup";
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  maxAttendees: string;
}

const emptyForm: EventFormData = {
  title: "",
  description: "",
  type: "meetup",
  date: "",
  startTime: "",
  endTime: "",
  location: "",
  maxAttendees: "",
};

interface EventFormDialogProps {
  slug: string;
  mode: "create" | "edit";
  eventId?: number;
  initialData?: Partial<EventFormData>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventFormDialog({ slug, mode, eventId, initialData, open, onOpenChange }: EventFormDialogProps) {
  const t = useTranslations("events");
  const utils = api.useUtils();
  const [form, setForm] = useState<EventFormData>(emptyForm);

  useEffect(() => {
    if (open && initialData) {
      setForm({ ...emptyForm, ...initialData });
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "create") {
      createMutation.mutate({
        communitySlug: slug,
        title: form.title,
        description: form.description || undefined,
        type: form.type,
        date: form.date,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        location: form.location,
        maxAttendees: form.maxAttendees ? parseInt(form.maxAttendees, 10) : undefined,
      });
    } else if (eventId) {
      updateMutation.mutate({
        eventId,
        communitySlug: slug,
        title: form.title,
        description: form.description || undefined,
        type: form.type,
        date: form.date,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        location: form.location,
        maxAttendees: form.maxAttendees ? parseInt(form.maxAttendees, 10) : undefined,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createEvent") : t("editEvent")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="event-title">{t("eventTitle")}</Label>
            <Input id="event-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} maxLength={255} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-description">{t("eventDescription")}</Label>
            <Textarea id="event-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={5000} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="event-type">{t("eventType")}</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as typeof form.type })}>
                <SelectTrigger id="event-type"><SelectValue /></SelectTrigger>
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
              <Input id="event-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="event-start">{t("eventStartTime")}</Label>
              <Input id="event-start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-end">{t("eventEndTime")}</Label>
              <Input id="event-end" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-location">{t("eventLocation")}</Label>
            <Input id="event-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required maxLength={255} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-max">{t("eventMaxAttendees")}</Label>
            <Input id="event-max" type="number" min={1} value={form.maxAttendees} onChange={(e) => setForm({ ...form, maxAttendees: e.target.value })} />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (<><Loader2 className="mr-2 size-4 animate-spin" />{t("creating")}</>) : (mode === "create" ? t("createEvent") : t("editEvent"))}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
