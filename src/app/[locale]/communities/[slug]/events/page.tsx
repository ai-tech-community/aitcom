"use client";

import { use, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Pencil, XCircle } from "lucide-react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { EventFormDialog } from "@/components/communities/event-form-dialog";

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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<{ id: number; data: Record<string, string> } | null>(null);

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

  const utils = api.useUtils();
  const cancelMutation = api.events.cancelEvent.useMutation({
    onSuccess: () => {
      toast.success(t("eventCancelled"));
      void utils.events.getCommunityEvents.invalidate();
    },
  });

  return (
    <div>
      {isAdminOrOwner && (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => { setEditingEvent(null); setDialogOpen(true); }}>
            <Plus className="mr-1.5 size-4" /> {t("createEvent")}
          </Button>
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
              {event.status === "cancelled" && (
                <span className="text-destructive font-mono text-[10px] font-medium sm:order-4 sm:ml-2">{t("cancelled")}</span>
              )}
              <span className="text-muted-foreground ml-4 hidden font-mono text-lg font-light sm:order-5 sm:inline">
                +
              </span>
              {isAdminOrOwner && event.status !== "cancelled" && (
                <div className="flex shrink-0 items-center gap-1 sm:order-6" onClick={(e) => e.preventDefault()}>
                  <button className="rounded p-1 hover:bg-zinc-100" onClick={() => {
                    setEditingEvent({
                      id: event.id,
                      data: {
                        title: event.title,
                        description: "",
                        type: event.type,
                        date: event.date?.split("T")[0] ?? "",
                        startTime: event.startTime ?? "",
                        endTime: event.endTime ?? "",
                        location: event.location,
                        maxAttendees: event.maxAttendees ? String(event.maxAttendees) : "",
                      },
                    });
                    setDialogOpen(true);
                  }}>
                    <Pencil className="size-3.5 text-zinc-400" />
                  </button>
                  <button className="rounded p-1 hover:bg-zinc-100" onClick={() => {
                    if (window.confirm(t("cancelEventConfirm"))) {
                      cancelMutation.mutate({ eventId: event.id, communitySlug: slug });
                    }
                  }}>
                    <XCircle className="size-3.5 text-zinc-400" />
                  </button>
                </div>
              )}
            </Link>
          ))}
        </>
      )}

      <EventFormDialog
        slug={slug}
        mode={editingEvent ? "edit" : "create"}
        eventId={editingEvent?.id}
        initialData={editingEvent?.data}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
