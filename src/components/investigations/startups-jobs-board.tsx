"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ArrowLink } from "@/components/dashboard/arrow-link";
import {
  DashboardSection,
  statusFromServerLoad,
} from "@/components/dashboard/dashboard-section";
import { useServerRefresh } from "@/components/dashboard/use-server-refresh";
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
 * A member's private pipeline for roles tracked on open positions: the Job
 * tracker tab, inside the shared dashboard section. Desktop shows every
 * stage as a column; small screens show one stage at a time behind stage
 * tabs. Each card offers its one likely next step directly and everything
 * else in a menu. The page loads the board on the server; `loadFailed`
 * shows an error with retry instead of an empty board.
 */
export function StartupsJobsBoard({
  locale,
  tracked,
  communities,
  helpRequests = [],
  loadFailed = false,
}: {
  locale: string;
  tracked: TrackedBoardRole[];
  communities: { slug: string; name: string }[];
  helpRequests?: RoleHelpRequest[];
  loadFailed?: boolean;
}) {
  const t = useTranslations("jobsBoard");
  const { refresh, refreshing } = useServerRefresh();
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
    onError: () => toast.error(t("moveFailed")),
  });
  const removeTrack = api.startups.setMyRoleApplication.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.startups.getMyRoleApplication.invalidate({
        roleId: variables.roleId,
      });
    },
    onError: () => toast.error(t("removeFailed")),
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
      toast.error(t("askFailed"));
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
      <DashboardSection
        title={t("title")}
        action={
          rows.length > 0 ? (
            <ArrowLink href={STARTUPS_JOBS_PATH}>{t("open")}</ArrowLink>
          ) : undefined
        }
        status={statusFromServerLoad({
          failed: loadFailed,
          refreshing,
          isEmpty: rows.length === 0,
          retry: refresh,
        })}
        empty={
          <EmptyState
            className="px-0 py-8"
            title={t("emptyTitle")}
            description={t("emptyHelp")}
            action={
              <ArrowLink href={STARTUPS_JOBS_PATH}>{t("open")}</ArrowLink>
            }
          />
        }
      >
        <p className="text-muted-foreground max-w-prose text-sm text-pretty">
          {t("lead")}
        </p>

        <div className="-mx-4 mt-6 overflow-x-auto px-4 sm:-mx-8 sm:px-8 lg:hidden">
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
          className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5"
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
      </DashboardSection>

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
