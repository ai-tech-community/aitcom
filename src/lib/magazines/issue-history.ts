import type { IssueStatus, PublishOrigin } from "./values";

export const ISSUE_HISTORY_EVENTS = [
  "draft_made",
  "draft_skipped",
  "items_changed",
  "auto_publish_stopped",
  "published",
  "deleted",
] as const;
export type IssueHistoryEvent = (typeof ISSUE_HISTORY_EVENTS)[number];
export const AUTO_DRAFT_SKIP_REASONS = [
  "too_few",
  "draft_open",
  "no_rights",
] as const;
export type AutoDraftSkipReason = (typeof AUTO_DRAFT_SKIP_REASONS)[number];
export type AutoDraftTrigger = "schedule" | "event" | "manual";
/** Why the scheduled run sent an issue back to draft. */
export const SCHEDULE_FAILURES = [
  "empty",
  "invalid_item",
  "no_rights",
  "error",
  "auto_off",
] as const;
export type ScheduleFailure = (typeof SCHEDULE_FAILURES)[number];

export type IssueHistoryDetail =
  | {
      event: "draft_made";
      trigger: AutoDraftTrigger;
      itemCount: number;
      goesOutAt: string | null;
    }
  | {
      event: "draft_skipped";
      trigger: AutoDraftTrigger;
      reason: AutoDraftSkipReason;
      found: number | null;
      needed: number | null;
    }
  | { event: "items_changed"; itemCount: number }
  | {
      event: "auto_publish_stopped";
      why: "edited" | "stopped" | "failed";
      failure?: ScheduleFailure;
    }
  | { event: "published"; origin: PublishOrigin }
  | { event: "deleted" };

export type IssueHistoryEntry = {
  id: number;
  detail: IssueHistoryDetail;
  actorName: string | null;
  issue: {
    id: number | null;
    number: number | null;
    title: string | null;
    status: IssueStatus | null;
  } | null;
  createdAt: string;
};
