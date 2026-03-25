"use client";

import { use, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Loader2 } from "lucide-react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const typeLabels: Record<string, string> = {
  workshop: "WORKSHOP",
  hackathon: "HACKATHON",
  deep_dive: "DEEP-DIVE",
  meetup: "MEETUP",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function CommunityEventsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("events");
  const { data: session } = authClient.useSession();

  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!session?.user },
  );
  const myMembership = myCommunities?.find((c) => c.slug === slug);
  const isAdminOrOwner =
    myMembership?.status === "active" &&
    (myMembership.role === "owner" || myMembership.role === "admin");

  const { data: eventsData, isLoading } = api.events.getCommunityEvents.useQuery(
    { communitySlug: slug },
  );
  const events = eventsData ?? [];

  return (
    <div>
      {isAdminOrOwner && (
        <div className="mb-4 flex justify-end">
          <CreateEventDialog slug={slug} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-muted h-14 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-muted-foreground mt-8 text-center">
          {t("noEvents")}
        </p>
      ) : (
        <>
          {/* Table Header - desktop only */}
          <div className="border-border hidden items-center border-b px-4 py-2.5 sm:flex">
            <span className="text-muted-foreground w-32 font-mono text-[11px] font-medium tracking-wider">
              / DATE
            </span>
            <span className="text-muted-foreground flex-1 font-mono text-[11px] font-medium tracking-wider">
              / NAME
            </span>
            <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-wider">
              / TYPE
            </span>
          </div>

          {events.map((event) => (
            <Link
              key={event.id}
              href={`/events/${event.slug}` as never}
              className="border-border hover:bg-secondary/50 flex flex-col gap-1.5 border-b px-4 py-3.5 transition-colors sm:flex-row sm:items-center sm:gap-0"
            >
              <span className="text-[15px] font-medium leading-snug sm:order-2 sm:flex-1">
                {event.title}
              </span>
              <div className="flex items-center gap-3 sm:order-1 sm:w-32">
                <div className="bg-foreground h-2 w-2 rounded-full" />
                <span className="font-mono text-[12px] sm:text-[13px]">
                  {formatDate(event.date)}
                </span>
                <span className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider sm:hidden">
                  {typeLabels[event.type] ?? event.type}
                </span>
              </div>
              <span className="border-border text-muted-foreground hidden rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider sm:order-3 sm:inline">
                {typeLabels[event.type] ?? event.type}
              </span>
              <span className="text-muted-foreground ml-4 hidden font-mono text-lg font-light sm:order-4 sm:inline">
                +
              </span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}

function CreateEventDialog({ slug }: { slug: string }) {
  const t = useTranslations("events");
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();

  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "meetup" as "workshop" | "hackathon" | "deep_dive" | "meetup",
    date: "",
    startTime: "",
    endTime: "",
    location: "",
    maxAttendees: "",
  });

  const createMutation = api.events.createEvent.useMutation({
    onSuccess: () => {
      toast.success(t("eventCreated"));
      setOpen(false);
      setForm({
        title: "",
        description: "",
        type: "meetup",
        date: "",
        startTime: "",
        endTime: "",
        location: "",
        maxAttendees: "",
      });
      void utils.events.getCommunityEvents.invalidate();
    },
    onError: () => {
      toast.error(t("eventCreateError"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          {t("createEvent")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("createEvent")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
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

          <div className="space-y-2">
            <Label htmlFor="event-description">{t("eventDescription")}</Label>
            <Textarea
              id="event-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              maxLength={5000}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="event-type">{t("eventType")}</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm({ ...form, type: v as typeof form.type })
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="event-start">{t("eventStartTime")}</Label>
              <Input
                id="event-start"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
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
          </div>

          <div className="space-y-2">
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
            <Label htmlFor="event-max">{t("eventMaxAttendees")}</Label>
            <Input
              id="event-max"
              type="number"
              min={1}
              value={form.maxAttendees}
              onChange={(e) => setForm({ ...form, maxAttendees: e.target.value })}
            />
          </div>

          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t("creating")}
              </>
            ) : (
              t("createEvent")
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
