/**
 * The ways the event organizer can slice the attendee list (ADR-0038). The
 * page and the CSV export use these same views, so a download always holds
 * what the organizer was looking at.
 */

export const ATTENDEE_STATUSES = [
  "registered",
  "waitlisted",
  "pending_payment",
  "attended",
  "cancelled",
  "payment_failed",
] as const;
export type AttendeeStatus = (typeof ATTENDEE_STATUSES)[number];

export const ATTENDEE_VIEWS = [
  "active",
  "registered",
  "waitlisted",
  "pending",
  "attended",
  "cancelled",
] as const;
export type AttendeeView = (typeof ATTENDEE_VIEWS)[number];

/** "active" is everyone still coming or waiting. */
export const VIEW_STATUSES: Record<AttendeeView, readonly AttendeeStatus[]> = {
  active: ["registered", "waitlisted", "pending_payment", "attended"],
  registered: ["registered"],
  waitlisted: ["waitlisted"],
  pending: ["pending_payment"],
  attended: ["attended"],
  cancelled: ["cancelled", "payment_failed"],
};

/** A view from untrusted input (a query string); "active" when unknown. */
export function parseAttendeeView(
  value: string | null | undefined,
): AttendeeView {
  return (ATTENDEE_VIEWS as readonly string[]).includes(value ?? "")
    ? (value as AttendeeView)
    : "active";
}
