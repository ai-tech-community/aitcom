"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StartupsJobsBoardCard } from "@/components/investigations/startups-jobs-board-card";
import {
  StartupsJobsHelpSheet,
  type RoleHelpDraft,
} from "@/components/investigations/startups-jobs-help-sheet";
import type { RoleHelpRequest } from "@/lib/investigations/startup-role-help";
import type { StartupRolePublic } from "@/lib/investigations/startup-roles";
import {
  TRACKING_STATUSES,
  type TrackingStatus,
} from "@/lib/investigations/startup-tracking";
import { STARTUPS_JOBS_PATH } from "@/lib/investigations/startups";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

export type TrackedBoardRole = {
  role: StartupRolePublic;
  status: TrackingStatus;
  /** When the member started tracking this role (ISO). */
  trackedAt: string;
};

/**
 * A member's private pipeline for roles tracked on open positions. Desktop
 * shows every stage as a column; small screens show one stage at a time
 * behind stage tabs. Each card offers its one likely next step directly and
 * everything else in a menu.
 */
export function StartupsJobsBoard({
  locale,
  tracked,
  communities,
  helpRequests = [],
}: {
  locale: string;
  tracked: TrackedBoardRole[];
  communities: { slug: string; name: string }[];
  helpRequests?: RoleHelpRequest[];
}) {
  const t = useTranslations("jobsBoard");
  const copyLocale = locale === "nl" ? "nl" : "en";
  const [rows, setRows] = useState(tracked);
  const [help, setHelp] = useState<RoleHelpRequest[]>(helpRequests);
  const [askingId, setAskingId] = useState<string | null>(null);
  const [stage, setStage] = useState<TrackingStatus>(
    () =>
      TRACKING_STATUSES.find((id) =>
        tracked.some((row) => row.status === id),
      ) ?? "applying",
  );
  const utils = api.useUtils();

  const setStatus = api.startups.setMyTrackedRoleStatus.useMutation({
    onError: (error) => toast.error(error.message),
  });
  const removeTrack = api.startups.setMyRoleApplication.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.startups.getMyRoleApplication.invalidate({
        roleId: variables.roleId,
      });
    },
    onError: (error) => toast.error(error.message),
  });
  const askHelp = api.startups.askMyTrackedRoleHelp.useMutation({
    onSuccess: (result) => {
      setHelp((current) => [
        result,
        ...current.filter(
          (row) =>
            !(
              row.roleId === result.roleId &&
              row.communitySlug === result.communitySlug
            ),
        ),
      ]);
      setAskingId(null);
      toast.success(t("posted"));
    },
    onError: (error) => {
      if (error.message === "RULES_NOT_ACCEPTED") {
        toast.error(t("rules"));
        return;
      }
      if (error.message === "CLASSROOM_NOT_FOUND") {
        toast.error(t("classroomMissing"));
        return;
      }
      toast.error(error.message);
    },
  });

  const asking = rows.find((row) => row.role.id === askingId)?.role ?? null;

  function move(roleId: string, status: TrackingStatus) {
    const previous = rows;
    setRows((current) =>
      current.map((row) => (row.role.id === roleId ? { ...row, status } : row)),
    );
    setStatus.mutate({ roleId, status }, { onError: () => setRows(previous) });
  }

  function remove(roleId: string) {
    const previous = rows;
    setRows((current) => current.filter((row) => row.role.id !== roleId));
    if (askingId === roleId) setAskingId(null);
    removeTrack.mutate(
      { roleId, applying: false },
      { onError: () => setRows(previous) },
    );
  }

  function post(roleId: string, draft: RoleHelpDraft) {
    if (askHelp.isPending) return;
    askHelp.mutate({
      roleId,
      communitySlug: draft.communitySlug,
      note: draft.note,
      classroom: draft.classroom,
      locale: copyLocale,
    });
  }

  const counts = Object.fromEntries(
    TRACKING_STATUSES.map((id) => [
      id,
      rows.filter((row) => row.status === id).length,
    ]),
  ) as Record<TrackingStatus, number>;

  return (
    <div data-startup-jobs-board="">
      <SectionLabel
        as="div"
        marker={false}
        className="flex items-center justify-between gap-4"
      >
        <span>
          <span aria-hidden="true">/ </span>
          {t("kicker")}
        </span>
        <Link
          href={STARTUPS_JOBS_PATH}
          className="hover:text-foreground inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
        >
          {t("open")}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </SectionLabel>

      <div className="mt-6 flex max-w-2xl flex-col gap-2">
        {/* The dashboard layout owns the page h1. */}
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("title")}
        </h2>
        <p className="text-muted-foreground text-base leading-relaxed">
          {t("lead")}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title={t("emptyTitle")}
            description={t("emptyHelp")}
            action={
              <Link
                href={STARTUPS_JOBS_PATH}
                className="text-sm font-medium underline-offset-4 hover:underline"
              >
                {t("open")}
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="-mx-6 mt-8 overflow-x-auto px-6 lg:hidden">
            <SegmentedControl<TrackingStatus>
              aria-label={t("stages")}
              value={stage}
              onValueChange={setStage}
              options={TRACKING_STATUSES.map((id) => ({
                value: id,
                label: (
                  <>
                    {t(id)}
                    <span className="text-muted-foreground font-mono text-xs tabular-nums">
                      {counts[id]}
                    </span>
                  </>
                ),
              }))}
            />
          </div>

          <div
            data-startup-board=""
            className="mt-6 grid grid-cols-1 gap-4 lg:mt-10 lg:grid-cols-5"
          >
            {TRACKING_STATUSES.map((status) => {
              const column = rows.filter((row) => row.status === status);
              const headingId = `board-${status}`;
              return (
                <section
                  key={status}
                  aria-labelledby={headingId}
                  data-board-column={status}
                  className={cn(
                    "flex min-w-0 flex-col gap-3",
                    status !== stage && "max-lg:hidden",
                  )}
                >
                  <div className="border-border flex items-baseline justify-between gap-2 border-b pb-2 max-lg:sr-only">
                    <h3
                      id={headingId}
                      className="text-muted-foreground font-mono text-xs font-medium tracking-wider uppercase"
                    >
                      {t(status)}
                    </h3>
                    <span className="text-muted-foreground font-mono text-xs tabular-nums">
                      {counts[status]}
                    </span>
                  </div>
                  {column.length === 0 ? (
                    <p className="border-border text-muted-foreground rounded-xl border border-dashed px-4 py-6 text-center text-xs">
                      {t("columnEmpty")}
                    </p>
                  ) : (
                    column.map(({ role, trackedAt }) => (
                      <StartupsJobsBoardCard
                        key={role.id}
                        role={role}
                        status={status}
                        trackedAt={trackedAt}
                        locale={copyLocale}
                        help={help.filter((row) => row.roleId === role.id)}
                        onMove={(next) => move(role.id, next)}
                        onAsk={() => setAskingId(role.id)}
                        onRemove={() => remove(role.id)}
                      />
                    ))
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      <StartupsJobsHelpSheet
        role={asking}
        communities={communities}
        pending={askHelp.isPending}
        onPost={(draft) => {
          if (asking) post(asking.id, draft);
        }}
        onClose={() => setAskingId(null)}
      />
    </div>
  );
}
