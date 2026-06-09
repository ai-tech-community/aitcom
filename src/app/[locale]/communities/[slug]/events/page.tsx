"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Plus,
  Pencil,
  XCircle,
  ExternalLink,
  CheckCircle,
  Clock,
  XOctagon,
} from "lucide-react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { EventFormDialog } from "@/components/communities/event-form-dialog";
import { CreateHackathonDialog } from "@/components/hackathon/create-hackathon-dialog";

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

type Tab = "published" | "pending" | "mine";

export default function CommunityEventsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("events");
  const { data: session } = authClient.useSession();

  const [activeTab, setActiveTab] = useState<Tab>("published");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<{
    id: number;
    resubmit?: boolean;
  } | null>(null);

  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!session?.user },
  );
  const myMembership = myCommunities?.find((c) => c.slug === slug);
  const isAdminOrOwner =
    myMembership?.status === "active" &&
    (myMembership.role === "owner" || myMembership.role === "admin");
  const isModerator =
    myMembership?.status === "active" && myMembership.role === "moderator";
  const canModerate = isAdminOrOwner || isModerator;
  const isActiveMember = myMembership?.status === "active";

  useEffect(() => {
    if (!canModerate && activeTab === "pending") setActiveTab("published");
    if (!isActiveMember && activeTab === "mine") setActiveTab("published");
  }, [canModerate, isActiveMember, activeTab]);

  const { data: eventsData, isLoading } =
    api.events.getCommunityEvents.useQuery({ communitySlug: slug });
  const events = eventsData ?? [];

  const { data: pendingEvents, isLoading: pendingLoading } =
    api.events.getPendingCommunityEvents.useQuery(
      { communitySlug: slug },
      { enabled: canModerate },
    );

  const { data: mySubmissions, isLoading: mySubmissionsLoading } =
    api.events.getMyEventSubmissions.useQuery(
      { communitySlug: slug },
      { enabled: isActiveMember && !!session?.user },
    );

  const utils = api.useUtils();

  const cancelMutation = api.events.cancelEvent.useMutation({
    onSuccess: () => {
      toast.success(t("eventCancelled"));
      void utils.events.getCommunityEvents.invalidate();
    },
  });

  const approveMutation = api.events.approveEvent.useMutation({
    onSuccess: () => {
      toast.success("Event approved and published");
      void utils.events.getPendingCommunityEvents.invalidate();
      void utils.events.getCommunityEvents.invalidate();
    },
    onError: () => toast.error("Failed to approve event"),
  });

  const rejectMutation = api.events.rejectEvent.useMutation({
    onSuccess: () => {
      toast.success("Event rejected — submitter has been notified");
      void utils.events.getPendingCommunityEvents.invalidate();
    },
    onError: () => toast.error("Failed to reject event"),
  });

  const pendingCount = pendingEvents?.length ?? 0;

  const sharedRowClassName =
    "border-border hover:bg-secondary/50 flex flex-col gap-1.5 border-b px-4 py-3.5 transition-colors sm:flex-row sm:items-center sm:gap-0";

  function renderEventRow(
    event: {
      id: number | string;
      title: string;
      type: string;
      date: string;
      startTime?: string | null;
      endTime?: string | null;
      location: string;
      status: string;
      source?: string;
      lumaUrl?: string | null;
      slug?: string | null;
      coverImageId?: number | null;
      coverImageUrl?: string | null;
    },
    opts: {
      showAdminActions?: boolean;
      showApproveReject?: boolean;
      showStatus?: boolean;
      showResubmit?: boolean;
    } = {},
  ) {
    const isLuma = event.source === "luma";

    const innerContent = (
      <>
        <span className="flex items-center gap-1.5 text-[15px] leading-snug font-medium sm:order-2 sm:flex-1">
          {event.title}
          {isLuma && (
            <ExternalLink className="text-muted-foreground inline size-3" />
          )}
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
        {opts.showStatus && event.status === "rejected" && (
          <span className="text-destructive flex items-center gap-1 font-mono text-[10px] font-medium sm:order-4 sm:ml-2">
            <XOctagon className="size-3" /> REJECTED — edit and resubmit
          </span>
        )}
        {opts.showStatus && event.status === "draft" && (
          <span className="text-muted-foreground flex items-center gap-1 font-mono text-[10px] font-medium sm:order-4 sm:ml-2">
            <Clock className="size-3" /> PENDING APPROVAL
          </span>
        )}
        {opts.showResubmit && event.status === "rejected" && (
          <div
            className="flex shrink-0 items-center gap-1 sm:order-6"
            onClick={(e) => e.preventDefault()}
          >
            <button
              className="rounded p-1 hover:bg-zinc-100"
              title="Edit and resubmit"
              onClick={() => {
                setEditingEvent({ id: event.id as number, resubmit: true });
                setDialogOpen(true);
              }}
            >
              <Pencil className="size-3.5 text-zinc-400" />
            </button>
          </div>
        )}
        {event.status === "cancelled" && (
          <span className="text-destructive font-mono text-[10px] font-medium sm:order-4 sm:ml-2">
            {t("cancelled")}
          </span>
        )}
        <span className="text-muted-foreground ml-4 hidden font-mono text-lg font-light sm:order-5 sm:inline">
          +
        </span>
        {opts.showAdminActions && !isLuma && event.status !== "cancelled" && (
          <div
            className="flex shrink-0 items-center gap-1 sm:order-6"
            onClick={(e) => e.preventDefault()}
          >
            <button
              className="rounded p-1 hover:bg-zinc-100"
              onClick={() => {
                setEditingEvent({ id: event.id as number });
                setDialogOpen(true);
              }}
            >
              <Pencil className="size-3.5 text-zinc-400" />
            </button>
            <button
              className="rounded p-1 hover:bg-zinc-100"
              onClick={() => {
                if (window.confirm(t("cancelEventConfirm"))) {
                  cancelMutation.mutate({
                    eventId: event.id as number,
                    communitySlug: slug,
                  });
                }
              }}
            >
              <XCircle className="size-3.5 text-zinc-400" />
            </button>
          </div>
        )}
        {opts.showApproveReject && (
          <div
            className="flex shrink-0 items-center gap-1 sm:order-6"
            onClick={(e) => e.preventDefault()}
          >
            <button
              className="flex items-center gap-1 rounded border border-green-600 px-2 py-0.5 font-mono text-[11px] text-green-600 hover:bg-green-50 disabled:opacity-50"
              disabled={approveMutation.isPending || rejectMutation.isPending}
              onClick={() =>
                approveMutation.mutate({
                  eventId: event.id as number,
                  communitySlug: slug,
                })
              }
            >
              <CheckCircle className="size-3" /> Approve
            </button>
            <button
              className="flex items-center gap-1 rounded border border-red-500 px-2 py-0.5 font-mono text-[11px] text-red-500 hover:bg-red-50 disabled:opacity-50"
              disabled={approveMutation.isPending || rejectMutation.isPending}
              onClick={() =>
                rejectMutation.mutate({
                  eventId: event.id as number,
                  communitySlug: slug,
                })
              }
            >
              <XOctagon className="size-3" /> Reject
            </button>
          </div>
        )}
      </>
    );

    if (isLuma && event.lumaUrl) {
      return (
        <a
          key={event.id}
          href={event.lumaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={sharedRowClassName}
        >
          {innerContent}
        </a>
      );
    }

    if (event.slug) {
      return (
        <Link
          key={event.id}
          href={`/events/${event.slug}` as never}
          className={sharedRowClassName}
        >
          {innerContent}
        </Link>
      );
    }

    return (
      <div key={event.id} className={sharedRowClassName}>
        {innerContent}
      </div>
    );
  }

  const tableHeader = (
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
  );

  return (
    <div>
      {/* Header row: tab switcher + action button */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex gap-1 font-mono text-[11px] tracking-wider">
          <button
            onClick={() => setActiveTab("published")}
            className={`rounded border px-3 py-1.5 transition-colors ${
              activeTab === "published"
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-secondary/40"
            }`}
          >
            EVENTS
          </button>
          {canModerate && (
            <button
              onClick={() => setActiveTab("pending")}
              className={`flex items-center gap-1.5 rounded border px-3 py-1.5 transition-colors ${
                activeTab === "pending"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-secondary/40"
              }`}
            >
              PENDING
              {pendingCount > 0 && (
                <span className="flex size-4 items-center justify-center rounded-full bg-orange-500 text-[9px] text-white">
                  {pendingCount}
                </span>
              )}
            </button>
          )}
          {isActiveMember && (
            <button
              onClick={() => setActiveTab("mine")}
              className={`rounded border px-3 py-1.5 transition-colors ${
                activeTab === "mine"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-secondary/40"
              }`}
            >
              MY SUBMISSIONS
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isAdminOrOwner && <CreateHackathonDialog communitySlug={slug} />}
          {isActiveMember && (
            <Button
              size="sm"
              onClick={() => {
                setEditingEvent(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-1.5 size-4" />
              {canModerate ? t("createEvent") : "Submit Event"}
            </Button>
          )}
        </div>
      </div>

      {/* PUBLISHED tab */}
      {activeTab === "published" && (
        <>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="bg-muted h-14 animate-pulse rounded-lg"
                />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="text-muted-foreground mt-8 text-center">
              {t("noEvents")}
            </p>
          ) : (
            <>
              {tableHeader}
              {events.map((event) =>
                renderEventRow(event, { showAdminActions: isAdminOrOwner }),
              )}
            </>
          )}
        </>
      )}

      {/* PENDING tab (admin/mod only) */}
      {activeTab === "pending" && canModerate && (
        <>
          {pendingLoading ? (
            <div className="space-y-2">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="bg-muted h-14 animate-pulse rounded-lg"
                />
              ))}
            </div>
          ) : (pendingEvents?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground mt-8 text-center">
              No events pending approval.
            </p>
          ) : (
            <>
              {tableHeader}
              {(pendingEvents ?? []).map((event) =>
                renderEventRow(event, { showApproveReject: true }),
              )}
            </>
          )}
        </>
      )}

      {/* MY SUBMISSIONS tab (active member, non-moderator) */}
      {activeTab === "mine" && isActiveMember && (
        <>
          {mySubmissionsLoading ? (
            <div className="space-y-2">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="bg-muted h-14 animate-pulse rounded-lg"
                />
              ))}
            </div>
          ) : (mySubmissions?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground mt-8 text-center">
              No submissions yet.
            </p>
          ) : (
            <>
              {tableHeader}
              {(mySubmissions ?? []).map((event) =>
                renderEventRow(event, { showStatus: true, showResubmit: true }),
              )}
            </>
          )}
        </>
      )}

      <EventFormDialog
        slug={slug}
        mode={
          editingEvent?.resubmit ? "resubmit" : editingEvent ? "edit" : "create"
        }
        eventId={editingEvent?.id}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isAdminOrOwner={isAdminOrOwner}
      />
    </div>
  );
}
