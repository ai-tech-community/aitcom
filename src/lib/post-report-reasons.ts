/**
 * Why a member can report a feed post. Shared by the server (input
 * validation, storage) and the client (report dialog, moderator banner), so
 * it lives outside `src/server` and imports nothing.
 */
export const REPORT_REASONS = [
  "spam",
  "inappropriate",
  "copyright",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
