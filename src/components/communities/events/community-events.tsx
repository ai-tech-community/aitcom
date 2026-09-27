"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { EventFormDialog } from "@/components/communities/event-form-dialog";
import { CreateHackathonDialog } from "@/components/hackathon/create-hackathon-dialog";
import { PendingEventConflictBadge } from "@/components/events/pending-event-conflict-badge";
import { TimetableRow } from "@/components/events/rows/timetable-row";
import { CompactEventRow } from "@/components/events/rows/compact-event-row";
import { useEventRowLabels } from "@/components/events/rows/use-event-row-labels";
import {
  presentEventRows,
  type EventRow,
} from "@/components/events/rows/event-rows";
import {
  manageHackathonHref,
  splitCommunityEvents,
  toCommunityEventRowInput,
  type CommunityEventContext,
  type CommunityEventItem,
  type CommunityEventView,
} from "./community-event-rows";
import {
  CancelEventButton,
  EditEventButton,
  EventStatusNote,
  ManageHackathonLink,
  ResubmitEventButton,
  ReviewButtons,
  RowActions,
  hasStatusNote,
} from "./community-event-actions";

type EditTarget = { id: number; resubmit?: boolean } | null;

/**
 * A community's events. Everyone sees the schedule: what is coming up as a
 * timetable (the true next event carries the `* NEXT UP` pin) and what
 * already took place as compact rows. Members can submit events and follow
 * their own submissions; moderators review the pending queue; owners and
 * admins create, edit and cancel events and create hackathons.
 *
 * Every row is the shared event row (same dates in the event's own zone,
 * same place words, EN/NL). Organiser controls and status notes plug into
 * the row's `actions` and `status` slots; they never fork the row.
 */
export function CommunityEvents({
  slug,
  now,
}: {
  slug: string;
  /** "Now" for splitting upcoming from past; tests pin it. */
  now?: Date;
}) {
  const t = useTranslations("events");
  const confirm = useConfirm();
  const locale = useLocale();
  const labels = useEventRowLabels();
  const { data: session } = authClient.useSession();

  const [view, setView] = useState<CommunityEventView>("published");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EditTarget>(null);

  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!session?.user },
  );
  const myMembership = myCommunities?.find((c) => c.slug === slug);
  const isActiveMember = myMembership?.status === "active";
  const isAdminOrOwner =
    isActiveMember &&
    (myMembership.role === "owner" || myMembership.role === "admin");
  const canModerate =
    isAdminOrOwner || (isActiveMember && myMembership.role === "moderator");

  useEffect(() => {
    if (!canModerate && view === "pending") setView("published");
    if (!isActiveMember && view === "mine") setView("published");
  }, [canModerate, isActiveMember, view]);

  const published = api.events.getCommunityEvents.useQuery({
    communitySlug: slug,
  });
  const pending = api.events.getPendingCommunityEvents.useQuery(
    { communitySlug: slug },
    { enabled: canModerate },
  );
  const mine = api.events.getMyEventSubmissions.useQuery(
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
      toast.success(t("eventApproved"));
      void utils.events.getPendingCommunityEvents.invalidate();
      void utils.events.getCommunityEvents.invalidate();
    },
    onError: () => toast.error(t("eventApproveError")),
  });
  const rejectMutation = api.events.rejectEvent.useMutation({
    onSuccess: () => {
      toast.success(t("eventRejected"));
      void utils.events.getPendingCommunityEvents.invalidate();
    },
    onError: () => toast.error(t("eventRejectError")),
  });
  const reviewing = approveMutation.isPending || rejectMutation.isPending;

  function openEditor(target: EditTarget) {
    setEditing(target);
    setDialogOpen(true);
  }

  async function cancelEvent(eventId: number) {
    const ok = await confirm({
      description: t("cancelEventConfirm"),
      destructive: true,
    });
    if (ok) cancelMutation.mutate({ eventId, communitySlug: slug });
  }

  async function rejectEvent(eventId: number) {
    // Rejection lands on a real submitter, so a mis-click must not fire
    // silently — same treatment as cancelling.
    const ok = await confirm({
      description: t("rejectEventConfirm"),
      destructive: true,
    });
    if (ok) rejectMutation.mutate({ eventId, communitySlug: slug });
  }

  /** Shared rows for one list, each paired with the event it came from. */
  function rowsFor(
    events: readonly CommunityEventItem[],
    listView: CommunityEventView,
  ): { event: CommunityEventItem; row: EventRow }[] {
    const context: CommunityEventContext = {
      communitySlug: slug,
      view: listView,
      isAdminOrOwner,
    };
    const rows = presentEventRows(
      events.map((event) => toCommunityEventRowInput(event, context)),
      { locale, labels, now },
    );
    return rows.map((row, i) => ({ event: events[i]!, row }));
  }

  /** Owner/admin controls on a published native event. */
  function publishedActions(event: CommunityEventItem): ReactNode {
    if (!isAdminOrOwner || event.source === "luma") return null;
    if (event.status === "cancelled") return null;
    const id = event.id as number;
    return (
      <RowActions className="sm:order-6">
        {event.type === "hackathon" &&
        event.status !== "draft" &&
        event.slug ? (
          <ManageHackathonLink href={manageHackathonHref(slug, event.slug)} />
        ) : null}
        <EditEventButton onEdit={() => openEditor({ id })} />
        <CancelEventButton onCancel={() => void cancelEvent(id)} />
      </RowActions>
    );
  }

  function statusFor(event: CommunityEventItem): ReactNode {
    return hasStatusNote(event.status) ? (
      <EventStatusNote status={event.status} />
    ) : undefined;
  }

  const views: { value: CommunityEventView; label: ReactNode }[] = [
    { value: "published", label: t("tabEvents") },
  ];
  if (canModerate) {
    const count = pending.data?.length ?? 0;
    views.push({
      value: "pending",
      label: (
        <>
          {t("tabPending")}
          {/* Warning, not orange: "waiting for review" is a status, and
              Signal Orange stays on the screen's one primary action. */}
          {count > 0 ? " " : null}
          {count > 0 ? (
            <span className="bg-warning text-warning-foreground inline-flex min-w-4 items-center justify-center rounded-full px-1 font-mono text-xs leading-4 tabular-nums">
              {count}
            </span>
          ) : null}
        </>
      ),
    });
  }
  if (isActiveMember) {
    views.push({ value: "mine", label: t("tabMySubmissions") });
  }

  return (
    <div>
      {views.length > 1 || isActiveMember ? (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          {views.length > 1 ? (
            <SegmentedControl
              // Long Dutch labels scroll inside the control on a phone
              // instead of pushing the page sideways.
              className="max-w-full max-sm:overflow-x-auto"
              aria-label={t("listsLabel")}
              options={views}
              value={view}
              onValueChange={setView}
            />
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {isAdminOrOwner ? (
              <CreateHackathonDialog communitySlug={slug} />
            ) : null}
            {isActiveMember ? (
              <Button onClick={() => openEditor(null)}>
                <Plus aria-hidden="true" />
                {canModerate ? t("createEvent") : t("submitEvent")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {view === "published" ? (
        <ListState
          query={published}
          skeletonRows={3}
          render={(events) => {
            const { upcoming, past } = splitCommunityEvents(events, now);
            if (upcoming.length === 0 && past.length === 0) {
              return <EmptyNote>{t("noEvents")}</EmptyNote>;
            }
            return (
              <>
                <section aria-labelledby="community-upcoming-events">
                  <SectionLabel id="community-upcoming-events" className="pb-4">
                    {t("title")}
                  </SectionLabel>
                  {upcoming.length === 0 ? (
                    <EmptyNote>{t("noEvents")}</EmptyNote>
                  ) : (
                    <ol className="divide-border border-border divide-y border-b">
                      {rowsFor(upcoming, "published").map(
                        ({ event, row }, index) => (
                          <li key={row.key}>
                            <TimetableRow
                              row={row}
                              isNext={index === 0}
                              nextLabel={t("nextUp")}
                              status={statusFor(event)}
                              actions={publishedActions(event)}
                            />
                          </li>
                        ),
                      )}
                    </ol>
                  )}
                </section>
                {past.length > 0 ? (
                  <section
                    aria-labelledby="community-past-events"
                    className="mt-12"
                  >
                    <SectionLabel id="community-past-events" className="pb-4">
                      {t("pastSection")}
                    </SectionLabel>
                    <ol className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                      {rowsFor(past, "published").map(({ event, row }) => (
                        <li
                          key={row.key}
                          className="border-border min-w-0 border-b"
                        >
                          <CompactEventRow
                            row={row}
                            where={[...row.placeParts, row.kind.label].join(
                              " · ",
                            )}
                            actions={publishedActions(event)}
                          />
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}
              </>
            );
          }}
        />
      ) : null}

      {/* The pending queue and "my submissions" are the section the person
          chose, not supplementary widgets: a failed load shows as an error
          (No-Silent-Failure), or a blank pane reads as "queue clear". Both
          keep the server's order (oldest submission first). */}
      {view === "pending" && canModerate ? (
        <ListState
          query={pending}
          skeletonRows={2}
          render={(events) =>
            events.length === 0 ? (
              <EmptyNote>{t("noEventsPendingApproval")}</EmptyNote>
            ) : (
              <ol className="divide-border border-border divide-y border-y">
                {rowsFor(events, "pending").map(({ row }, i) => {
                  const event = events[i]!;
                  return (
                    <li key={row.key}>
                      <TimetableRow
                        row={row}
                        actions={
                          <>
                            {/* Fresh conflict check (#208): its chip joins
                                the controls, its expansion takes a full
                                line under the row. */}
                            <PendingEventConflictBadge
                              event={{
                                id: event.id,
                                date: event.date,
                                startTime: event.startTime,
                                endTime: event.endTime,
                                timezone: event.timezone,
                                format: event.format,
                                city: event.city,
                                audience: event.audience,
                              }}
                            />
                            <RowActions className="sm:order-6">
                              {/* Queue rows never link (#214), so a draft
                                  hackathon's manage page needs its own
                                  control. */}
                              {event.type === "hackathon" && isAdminOrOwner ? (
                                <ManageHackathonLink
                                  href={manageHackathonHref(slug, event.slug)}
                                />
                              ) : null}
                              <ReviewButtons
                                busy={reviewing}
                                onApprove={() =>
                                  approveMutation.mutate({
                                    eventId: event.id,
                                    communitySlug: slug,
                                  })
                                }
                                onReject={() => void rejectEvent(event.id)}
                              />
                            </RowActions>
                          </>
                        }
                      />
                    </li>
                  );
                })}
              </ol>
            )
          }
        />
      ) : null}

      {view === "mine" && isActiveMember ? (
        <ListState
          query={mine}
          skeletonRows={2}
          render={(events) =>
            events.length === 0 ? (
              <EmptyNote>{t("noSubmissionsYet")}</EmptyNote>
            ) : (
              <ol className="divide-border border-border divide-y border-y">
                {rowsFor(events, "mine").map(({ event, row }) => (
                  <li key={row.key}>
                    <TimetableRow
                      row={row}
                      status={statusFor(event)}
                      actions={
                        event.status === "rejected" ? (
                          <RowActions className="sm:order-6">
                            <ResubmitEventButton
                              onResubmit={() =>
                                openEditor({
                                  id: event.id as number,
                                  resubmit: true,
                                })
                              }
                            />
                          </RowActions>
                        ) : undefined
                      }
                    />
                  </li>
                ))}
              </ol>
            )
          }
        />
      ) : null}

      <EventFormDialog
        slug={slug}
        mode={editing?.resubmit ? "resubmit" : editing ? "edit" : "create"}
        eventId={editing?.id}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isAdminOrOwner={isAdminOrOwner}
      />
    </div>
  );
}

/** Loading → skeleton rows, error → retry, data → the list. */
function ListState<T>({
  query,
  skeletonRows,
  render,
}: {
  query: {
    data: T[] | undefined;
    isLoading: boolean;
    isError: boolean;
    refetch: () => unknown;
  };
  skeletonRows: number;
  render: (data: T[]) => ReactNode;
}) {
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  if (query.isLoading || !query.data) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: skeletonRows }, (_, n) => (
          <Skeleton key={n} className="h-20 rounded-md" />
        ))}
      </div>
    );
  }
  return <>{render(query.data)}</>;
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground mt-6 text-base leading-relaxed">
      {children}
    </p>
  );
}
