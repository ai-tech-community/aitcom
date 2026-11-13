import { REPORT_REASON_LABELS, REPORT_REASONS } from "./post-report-reasons";

/**
 * Why someone can report a gallery item: the feed's reasons plus
 * `this_is_me` ("This is me, please remove it"), which also tells the
 * uploader. Shared by the server and the client, so it lives outside
 * `src/server`. The feed's own list and its database enum stay unchanged.
 */
export const GALLERY_REPORT_REASONS = [
  ...REPORT_REASONS,
  "this_is_me",
] as const;
export type GalleryReportReason = (typeof GALLERY_REPORT_REASONS)[number];

/** The longest note a reporter may add, in characters. */
export const GALLERY_REPORT_NOTE_MAX = 500;

/** Names for the admin panel (members see translated copy instead). */
export const GALLERY_REPORT_REASON_LABELS: Record<GalleryReportReason, string> =
  {
    ...REPORT_REASON_LABELS,
    this_is_me: "This is me",
  };
