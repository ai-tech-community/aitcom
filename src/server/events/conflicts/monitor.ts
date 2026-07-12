/**
 * Pure Slice J conflict-monitoring logic: maps a published event doc to the
 * conflict engine's candidate shape, filters engine verdicts down to what's
 * worth alerting an organizer on, and builds the consolidated notification
 * payload for newly-appeared conflicts. Zero I/O: no Payload/db imports, no
 * `Date.now()`/argless `new Date()` — the cron route (Task 2) owns all I/O
 * and injects `now` where needed. See CONTEXT.md [[scheduling-conflict]] and
 * the Slice J task brief (.superpowers/sdd/task-1-brief.md) for the design.
 */

import { DEFAULT_EVENT_TIMEZONE, isValidTimeZone } from "@/lib/event-time";
import type { Audience, Event } from "@/payload-types";
import {
  CONFLICT_GRADE_ORDER,
  type ConflictCandidate,
  type ConflictGrade,
  type ConflictVerdict,
} from "./rule";

/** Scan horizon for the daily monitor cron: events due in the next 30 days. */
export const MONITOR_HORIZON_DAYS = 30;

/**
 * Grades worth alerting an organizer on (brief decision #1). Same-day is too
 * weak a signal to alert on; tentative holds are excluded separately in
 * `selectMaterialConflicts` regardless of grade (they're anonymized and
 * low-signal — you can't name the competitor).
 */
export const MATERIAL_GRADES: readonly ConflictGrade[] = Object.freeze([
  "clash",
  "same-evening",
]);

export interface MonitorTarget {
  candidate: ConflictCandidate;
  audienceSlugs: string[];
  organizerId: string;
  eventId: number;
  eventTitle: string;
  eventSlug: string;
}

/**
 * Maps a published event doc (depth: 1, `audience` populated as `{id,slug}`
 * objects) to the conflict engine's candidate shape plus the bits the cron
 * needs for dedupe/notification. Returns `null` when the event can't be
 * monitored:
 *
 * - `submittedBy` is empty — discovered/imported events have no owner to
 *   notify (brief decision #2).
 * - `audience` is empty or absent — nothing to check the event against.
 * - Any `audience` entry comes back as a bare id instead of a populated
 *   `{id,slug}` object — an unexpected shallow fetch upstream. Without a
 *   slug for every entry, the audience set downstream (related-audience
 *   expansion) can't be trusted, so the whole event is skipped rather than
 *   silently checked against a partial audience set.
 */
export function buildMonitorTarget(eventDoc: Event): MonitorTarget | null {
  const organizerId = eventDoc.submittedBy?.trim();
  if (!organizerId) return null;

  if (!Array.isArray(eventDoc.audience) || eventDoc.audience.length === 0) {
    return null;
  }

  const audienceEntries: Audience[] = [];
  for (const entry of eventDoc.audience) {
    if (typeof entry !== "object" || entry === null) return null;
    audienceEntries.push(entry);
  }

  const candidate: ConflictCandidate = {
    date: eventDoc.date,
    startTime: eventDoc.startTime ?? null,
    endTime: eventDoc.endTime ?? null,
    // Legacy/imported events can carry a garbage IANA string; validate the
    // same way corpus.ts does so a bad zone falls back rather than throwing a
    // RangeError deep in eventWallTimeToUtc mid-scan on the organizer's own
    // event.
    timezone: isValidTimeZone(eventDoc.timezone)
      ? eventDoc.timezone
      : DEFAULT_EVENT_TIMEZONE,
    format: eventDoc.format ?? "online",
    city: eventDoc.city ?? null,
    latitude: eventDoc.latitude ?? null,
    longitude: eventDoc.longitude ?? null,
    audienceIds: audienceEntries.map((entry) => entry.id),
  };

  return {
    candidate,
    audienceSlugs: audienceEntries.map((entry) => entry.slug),
    organizerId,
    eventId: eventDoc.id,
    eventTitle: eventDoc.title,
    eventSlug: eventDoc.slug,
  };
}

/**
 * Filters engine verdicts to the ones worth alerting an organizer on:
 * non-tentative AND graded `clash` or `same-evening` (`MATERIAL_GRADES`).
 * Sorted most severe first (`CONFLICT_GRADE_ORDER`), then by the conflicting
 * event's date.
 */
export function selectMaterialConflicts(
  verdicts: ConflictVerdict[],
): ConflictVerdict[] {
  return verdicts
    .filter(
      (verdict) =>
        !verdict.tentative && MATERIAL_GRADES.includes(verdict.grade),
    )
    .sort((a, b) => {
      const gradeDelta =
        CONFLICT_GRADE_ORDER.indexOf(a.grade) -
        CONFLICT_GRADE_ORDER.indexOf(b.grade);
      if (gradeDelta !== 0) return gradeDelta;
      return a.event.date.localeCompare(b.event.date);
    });
}

/**
 * Dedupe key for the `broadcastDeliveries` claim (brief decision #3):
 * window-agnostic and per ordered pair (event, conflicting event), so
 * re-scans never re-alert once a pair has been claimed for this event's
 * organizer. Well under the 255-char column limit for any realistic id pair.
 */
export function conflictDedupeKey(
  eventId: number,
  conflictingEventId: number,
): string {
  return `event-conflict:${eventId}:${conflictingEventId}`;
}

export interface ConflictNotificationPayload {
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

/** Calendar-date key (YYYY-MM-DD); mirrors rule.ts's private helper of the same name. */
function calendarDateKey(date: string): string {
  return date.split("T")[0] ?? date;
}

/**
 * `notifications.title` is `varchar(255)`; event titles are unbounded free
 * text. Truncate the embedded event title well under that ceiling (200 chars
 * leaves ~55 chars of headroom for the `Schedule conflict for "…"` wrapper)
 * so a long title can never overflow the column and throw on insert — which,
 * because the `broadcastDeliveries` claim has already won by that point,
 * would permanently suppress that alert (forever-dedupe, no retry).
 */
const EVENT_TITLE_TRUNCATE_LENGTH = 200;

function truncateEventTitle(title: string): string {
  if (title.length <= EVENT_TITLE_TRUNCATE_LENGTH) return title;
  return `${title.slice(0, EVENT_TITLE_TRUNCATE_LENGTH - 1)}…`;
}

/**
 * Builds the single consolidated in-app notification for one event's
 * newly-appeared material conflicts (brief decision #4: one notification per
 * event per run, not one per pair). `newConflicts` must be non-empty and is
 * expected to already be `selectMaterialConflicts`-ordered (most severe
 * first) — the first entry names the top competitor and grade. Copy is
 * plain, factual English (crons have no locale); identifiers live in
 * `metadata`, not the copy — the client renders the manage-page link from
 * `eventId`.
 */
export function buildConflictNotification(
  target: MonitorTarget,
  newConflicts: ConflictVerdict[],
): ConflictNotificationPayload {
  const count = newConflicts.length;
  const top = newConflicts[0]!;
  const noun = count === 1 ? "event" : "events";
  const verb = count === 1 ? "competes" : "compete";
  const date = calendarDateKey(target.candidate.date);

  return {
    title: `Schedule conflict for "${truncateEventTitle(target.eventTitle)}"`,
    content: `${count} ${noun} now ${verb} for your audience around ${date}, including "${top.event.title}".`,
    metadata: {
      eventId: target.eventId,
      conflictingEventIds: newConflicts.map((verdict) => verdict.event.id),
      topGrade: top.grade,
      // Community slug isn't cleanly available on the event doc (only
      // `communityId`, not a slug — resolving it would mean an extra query
      // per event this cron doesn't otherwise need), so this points at the
      // public event page rather than the community-scoped manage page that
      // other reviewPaths use. Same leading-slash, locale-free contract
      // consumed by notification-panel.tsx / notifications-page-content.tsx.
      reviewPath: `/events/${target.eventSlug}`,
    },
  };
}
