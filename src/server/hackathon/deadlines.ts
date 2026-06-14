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

/** Human-readable messages keyed by stable reason (single source of i18n prose). */
export const DEADLINE_MESSAGES: Record<DeadlineReason, string> = {
  registration_closed: "Registration for this hackathon has closed.",
  submission_closed: "The submission deadline for this hackathon has passed.",
  judging_closed: "The judging deadline for this hackathon has passed.",
};

function toTime(raw: Date | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const t = (raw instanceof Date ? raw : new Date(raw)).getTime();
  return Number.isNaN(t) ? null : t;
}

function gate(
  raw: Date | string | null | undefined,
  now: Date,
  reason: DeadlineReason,
): GateResult {
  const t = toTime(raw);
  if (t === null) {
    return { open: true, deadline: null, reason: null };
  }
  const open = now.getTime() <= t;
  return { open, deadline: new Date(t), reason: open ? null : reason };
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
  const chain: { label: string; t: number | null }[] = [
    { label: "registration", t: toTime(event.registrationDeadline) },
    { label: "submission", t: toTime(event.submissionDeadline) },
    { label: "judging", t: toTime(event.judgingDeadline) },
    { label: "results", t: toTime(event.resultsDate) },
  ];
  const warnings: string[] = [];
  let prev: { label: string; t: number } | null = null;
  for (const cur of chain) {
    if (cur.t === null) continue; // unset: skip, don't reset the predecessor
    if (prev !== null && cur.t < prev.t) {
      warnings.push(
        `${capitalize(cur.label)} deadline is before the ${prev.label} deadline.`,
      );
    }
    prev = { label: cur.label, t: cur.t };
  }
  return warnings;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Adapter for the Events beforeValidate hook: returns deadline-order warnings for
 * hackathon events only (empty for any other type), normalizing the loosely-typed
 * admin `data` object's optional fields. Pure — the hook layers logging on top.
 */
export function eventDeadlineWarnings(
  data:
    | {
        type?: string | null;
        registrationDeadline?: Date | string | null;
        submissionDeadline?: Date | string | null;
        judgingDeadline?: Date | string | null;
        resultsDate?: Date | string | null;
      }
    | null
    | undefined,
): string[] {
  if (data?.type !== "hackathon") return [];
  return deadlineOrderWarnings({
    registrationDeadline: data.registrationDeadline ?? null,
    submissionDeadline: data.submissionDeadline ?? null,
    judgingDeadline: data.judgingDeadline ?? null,
    resultsDate: data.resultsDate ?? null,
  });
}
