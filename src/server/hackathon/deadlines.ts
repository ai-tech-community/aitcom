// src/server/hackathon/deadlines.ts
// Event-level hackathon timeline gates (spec 2026-06-14). Pure + now-injected so
// they are deterministic, unit-testable, and the SINGLE source of truth shared by
// the enforcing mutations and any future countdown UI. A deadline is authoritative
// over the manual phase buttons; an UNSET deadline means "no enforced window" and
// preserves today's phase-driven behavior (non-breaking). "Open" is inclusive of
// the deadline instant: open === now <= deadline.

export interface EventDeadlines {
  registrationDeadline?: Date | string | null;
  submissionDeadline?: Date | string | null;
  judgingDeadline?: Date | string | null;
  resultsDate?: Date | string | null;
}

/** Stable i18n/error keys emitted when a gate is closed. */
export type DeadlineReason =
  | "registration_closed"
  | "submission_closed"
  | "judging_closed";

export interface GateResult {
  open: boolean;
  /** The effective deadline, or null when none is set. */
  deadline: Date | null;
  /** Stable i18n/error key when closed, else null. */
  reason: DeadlineReason | null;
}

function toTime(raw: Date | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  return (raw instanceof Date ? raw : new Date(raw)).getTime();
}

function gate(
  raw: Date | string | null | undefined,
  now: Date,
  reason: DeadlineReason,
): GateResult {
  if (raw === null || raw === undefined) {
    return { open: true, deadline: null, reason: null };
  }
  const deadline = raw instanceof Date ? raw : new Date(raw);
  const open = now.getTime() <= deadline.getTime();
  return { open, deadline, reason: open ? null : reason };
}

export function isRegistrationOpen(event: EventDeadlines, now: Date): GateResult {
  return gate(event.registrationDeadline, now, "registration_closed");
}

export function isSubmissionOpen(event: EventDeadlines, now: Date): GateResult {
  return gate(event.submissionDeadline, now, "submission_closed");
}

export function isJudgingOpen(event: EventDeadlines, now: Date): GateResult {
  return gate(event.judgingDeadline, now, "judging_closed");
}

/**
 * Soft validation: returns human-readable warnings when the set deadlines are not
 * chronological (registration ≤ submission ≤ judging ≤ results). Unset deadlines
 * are skipped.
 * Returns [] when fine. Callers WARN — they must not block the save (organizers set
 * deadlines out of order while drafting).
 */
export function deadlineOrderWarnings(event: EventDeadlines): string[] {
  const reg = toTime(event.registrationDeadline);
  const sub = toTime(event.submissionDeadline);
  const judge = toTime(event.judgingDeadline);
  const results = toTime(event.resultsDate);
  const warnings: string[] = [];
  if (reg !== null && sub !== null && sub < reg) {
    warnings.push("Submission deadline is before the registration deadline.");
  }
  if (sub !== null && judge !== null && judge < sub) {
    warnings.push("Judging deadline is before the submission deadline.");
  }
  if (judge !== null && results !== null && results < judge) {
    warnings.push("Results date is before the judging deadline.");
  }
  return warnings;
}
