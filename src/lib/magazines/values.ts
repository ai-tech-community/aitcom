/**
 * Shared value lists for community magazines (spec 2026-10-26). The Payload
 * collections, the services and the UI all read these, so a value exists in
 * exactly one place.
 */

/** Who may read an issue: members, a preview for everyone, or public. */
export const ISSUE_VISIBILITIES = ["members", "teaser", "public"] as const;
export type IssueVisibility = (typeof ISSUE_VISIBILITIES)[number];
/** Payload admin labels. Site copy goes through next-intl instead. */
export const ISSUE_VISIBILITY_LABELS: Record<IssueVisibility, string> = {
  members: "Members only",
  teaser: "Preview for everyone",
  public: "Public",
};

/** An issue can be drafted, scheduled for later, or published. */
export const ISSUE_STATUSES = ["draft", "scheduled", "published"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
};

export const ISSUE_ACTIONS = [
  "schedule",
  "unschedule",
  "publish",
  "delete",
] as const;
export type IssueAction = (typeof ISSUE_ACTIONS)[number];
/** The one table of what an issue in each status may do next. Services pre-check with it; the UI branches on it. */
export const ISSUE_TRANSITIONS: Record<IssueStatus, readonly IssueAction[]> = {
  draft: ["schedule", "publish", "delete"],
  scheduled: ["schedule", "unschedule", "publish"],
  published: [],
};

export function canIssue(status: IssueStatus, action: IssueAction): boolean {
  return ISSUE_TRANSITIONS[status].includes(action);
}

export const PUBLISH_ORIGINS = ["button", "schedule", "auto"] as const;
export type PublishOrigin = (typeof PUBLISH_ORIGINS)[number];

export const SCHEDULE_ORIGINS = [
  "schedule",
  "auto",
] as const satisfies readonly PublishOrigin[];
export type ScheduleOrigin = (typeof SCHEDULE_ORIGINS)[number];

/** How an issue's items are laid out on its reading page. */
export const ISSUE_LAYOUTS = ["cover-story"] as const;
export type IssueLayout = (typeof ISSUE_LAYOUTS)[number];
export const ISSUE_LAYOUT_LABELS: Record<IssueLayout, string> = {
  "cover-story": "Cover story",
};

/** Lower-case words joined by single hyphens; 3–60 characters. */
export const MAGAZINE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // 3–60 chars

/** Most topics a magazine can list. */
export const MAX_MAGAZINE_TOPICS = 5;
