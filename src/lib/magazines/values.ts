/**
 * Shared value lists for community magazines (spec 2026-10-26). The Payload
 * collections, the services and the UI all read these, so a value exists in
 * exactly one place.
 */

/** Who may read an issue: community members only, or anyone. */
export const ISSUE_VISIBILITIES = ["members", "public"] as const;
export type IssueVisibility = (typeof ISSUE_VISIBILITIES)[number];
/** Payload admin labels. Site copy goes through next-intl instead. */
export const ISSUE_VISIBILITY_LABELS: Record<IssueVisibility, string> = {
  members: "Members only",
  public: "Public",
};

/** An issue is drafted, then published (slice 1 has no scheduling). */
export const ISSUE_STATUSES = ["draft", "published"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  draft: "Draft",
  published: "Published",
};

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
