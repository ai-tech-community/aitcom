/**
 * Pure scheduling-conflict rule for the event corpus. Given a candidate event
 * being planned and a single event already in the corpus, decides whether
 * the two conflict and, if so, how severely.
 *
 * Zero I/O: no Payload imports, no `Date.now()`/argless `new Date()`. All
 * time math goes through `eventWallTimeToUtc` (src/lib/event-time.ts) so DST
 * transitions and cross-timezone comparisons resolve to real instants; all
 * geography goes through `haversineDistanceKm` (src/lib/geo.ts). See
 * CONTEXT.md [[scheduling-conflict]] for the domain vocabulary and ADR-0035
 * for the "no live external API calls" constraint this module upholds by
 * construction (it takes plain data in, returns plain data out).
 */

import { eventWallTimeToUtc, instantToZonedDateString } from "@/lib/event-time";
import { haversineDistanceKm } from "@/lib/geo";

export interface ConflictCandidate {
  date: string; // ISO or YYYY-MM-DD, calendar date authoritative
  startTime?: string | null; // "HH:MM"
  endTime?: string | null; // "HH:MM"
  timezone: string; // IANA, caller applies DEFAULT_EVENT_TIMEZONE fallback
  format: "online" | "in-person" | "hybrid";
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  audienceIds: number[]; // direct target audiences
}

export interface CorpusEvent extends Omit<ConflictCandidate, "audienceIds"> {
  id: number;
  title: string;
  audienceIds: number[];
  tentative: boolean; // status === "draft"
  sourceUrl?: string | null; // discovered/import provenance (for UI badge later)
  communityId?: string | null;
}

export type ConflictGrade = "clash" | "same-evening" | "same-day";

export interface ConflictVerdict {
  event: CorpusEvent;
  grade: ConflictGrade; // final grade AFTER related-audience downgrade
  audienceMatch: "direct" | "related";
  tentative: boolean;
  overlapMinutes: number | null; // when a padded time overlap exists
}

/**
 * Most severe first — used for sorting verdict lists. Frozen: this is shared
 * module state, and a downstream in-place `.sort()` must not mutate it.
 */
export const CONFLICT_GRADE_ORDER: readonly ConflictGrade[] = Object.freeze([
  "clash",
  "same-evening",
  "same-day",
]);

const MINUTE_MS = 60_000;
const DEFAULT_DURATION_MS = 120 * MINUTE_MS;
const IN_PERSON_PAD_MS = 60 * MINUTE_MS;
const SAME_EVENING_GAP_MS = 4 * 60 * MINUTE_MS;
const CATCHMENT_RADIUS_KM = 50;

type TimeFields = Pick<
  ConflictCandidate,
  "date" | "startTime" | "endTime" | "timezone" | "format"
>;
type CatchmentFields = Pick<
  ConflictCandidate,
  "format" | "city" | "latitude" | "longitude"
>;

/** Calendar-date key (YYYY-MM-DD) taken directly from the authoritative `date` field — no timezone reinterpretation. */
function calendarDateKey(date: string): string {
  return date.split("T")[0] ?? date;
}

function sameCalendarDay(a: string, b: string): boolean {
  return calendarDateKey(a) === calendarDateKey(b);
}

/** Calendar date (YYYY-MM-DD) of a UTC epoch-ms instant as observed in `timezone`. */
function instantDayInZone(epochMs: number, timezone: string): string {
  return instantToZonedDateString(new Date(epochMs).toISOString(), timezone);
}

function isOnline(format: ConflictCandidate["format"]): boolean {
  return format === "online";
}

/**
 * Audience gate. A shared id in both `audienceIds` sets is a `direct` match;
 * a shared id only after expanding the candidate's set with `relatedIdSet`
 * is a `related` match; otherwise there is no conflict at all.
 */
function resolveAudienceMatch(
  candidate: ConflictCandidate,
  event: CorpusEvent,
  relatedIdSet: Set<number>,
): "direct" | "related" | null {
  const directIds = new Set(candidate.audienceIds);
  if (event.audienceIds.some((id) => directIds.has(id))) return "direct";

  const expandedIds = new Set(directIds);
  for (const id of relatedIdSet) expandedIds.add(id);
  if (event.audienceIds.some((id) => expandedIds.has(id))) return "related";

  return null;
}

/**
 * Catchment gate. An online side matches any catchment (it competes with
 * everything its audience could attend). Otherwise both sides are
 * effectively in-person (in-person, or hybrid on its in-person side) and
 * must share a catchment: coords within 50km when both have coords,
 * else equal (trimmed, case-insensitive) city when either is missing coords.
 * In-person with neither coords nor city on either side conservatively fails
 * — unknown geography must not produce a false-positive conflict.
 */
function passesCatchmentGate(
  candidate: CatchmentFields,
  event: CatchmentFields,
): boolean {
  if (isOnline(candidate.format) || isOnline(event.format)) return true;

  const candidateHasCoords =
    candidate.latitude != null && candidate.longitude != null;
  const eventHasCoords = event.latitude != null && event.longitude != null;

  if (candidateHasCoords && eventHasCoords) {
    const distanceKm = haversineDistanceKm(
      { lat: candidate.latitude!, lng: candidate.longitude! },
      { lat: event.latitude!, lng: event.longitude! },
    );
    return distanceKm <= CATCHMENT_RADIUS_KM;
  }

  const candidateCity = candidate.city?.trim();
  const eventCity = event.city?.trim();
  if (candidateCity && eventCity) {
    return candidateCity.toLowerCase() === eventCity.toLowerCase();
  }

  return false;
}

interface TimeGradeResult {
  grade: ConflictGrade;
  overlapMinutes: number | null;
}

/**
 * Time grade. Missing `startTime` on either side falls back to all-day
 * semantics (same event-local calendar day or nothing). Otherwise both
 * intervals are built (defaulting a missing `endTime` to a 120-minute
 * duration), padded +-60 minutes when either side is in-person/hybrid, and
 * tested for overlap. A padded overlap is a `clash` (reporting the raw,
 * unpadded overlap in minutes, floored at 0). Failing that, a start-to-start
 * gap of at most 4 hours is `same-evening` — real-time adjacency counts even
 * across a local midnight (23:30 New York back-to-back with 08:00 Amsterdam
 * the next calendar date is still the same evening for a shared audience).
 * Else, same calendar day with both start instants projected into the
 * candidate's timezone → `same-day`; different days → no conflict.
 */
function computeTimeGrade(
  candidate: TimeFields,
  event: TimeFields,
): TimeGradeResult | null {
  if (!candidate.startTime || !event.startTime) {
    if (candidate.startTime || event.startTime) {
      // Exactly one side is all-day: project the timed side's start instant
      // into the candidate's timezone and compare with the all-day side's
      // authoritative calendar date.
      const [timed, allDay] = candidate.startTime
        ? [candidate, event]
        : [event, candidate];
      const timedDay = instantDayInZone(
        eventWallTimeToUtc(
          timed.date,
          timed.startTime!,
          timed.timezone,
        ).getTime(),
        candidate.timezone,
      );
      if (timedDay !== calendarDateKey(allDay.date)) return null;
    } else if (!sameCalendarDay(candidate.date, event.date)) {
      // Both sides are all-day: no instant exists on either side, so raw
      // calendar-date-string equality is the only available semantics.
      return null;
    }
    return { grade: "same-day", overlapMinutes: null };
  }

  const candidateStart = eventWallTimeToUtc(
    candidate.date,
    candidate.startTime,
    candidate.timezone,
  ).getTime();
  const candidateEnd = candidate.endTime
    ? eventWallTimeToUtc(
        candidate.date,
        candidate.endTime,
        candidate.timezone,
      ).getTime()
    : candidateStart + DEFAULT_DURATION_MS;

  const eventStart = eventWallTimeToUtc(
    event.date,
    event.startTime,
    event.timezone,
  ).getTime();
  const eventEnd = event.endTime
    ? eventWallTimeToUtc(event.date, event.endTime, event.timezone).getTime()
    : eventStart + DEFAULT_DURATION_MS;

  const padMs =
    isOnline(candidate.format) && isOnline(event.format) ? 0 : IN_PERSON_PAD_MS;

  const paddedCandidateStart = candidateStart - padMs;
  const paddedCandidateEnd = candidateEnd + padMs;
  const paddedEventStart = eventStart - padMs;
  const paddedEventEnd = eventEnd + padMs;

  const paddedOverlaps =
    paddedCandidateStart < paddedEventEnd &&
    paddedEventStart < paddedCandidateEnd;

  if (paddedOverlaps) {
    const rawOverlapMs =
      Math.min(candidateEnd, eventEnd) - Math.max(candidateStart, eventStart);
    return {
      grade: "clash",
      overlapMinutes: Math.max(0, Math.round(rawOverlapMs / MINUTE_MS)),
    };
  }

  // Same-evening is about real-time adjacency for the attendee, so the
  // start-gap check comes first and deliberately ignores calendar days: two
  // events 2.5h apart straddling a local midnight still compete for the same
  // evening.
  const startGapMs = Math.abs(candidateStart - eventStart);
  if (startGapMs <= SAME_EVENING_GAP_MS) {
    return { grade: "same-evening", overlapMinutes: null };
  }

  // Same-day compares both start instants projected into the candidate's
  // timezone — equal raw `date` strings can hide different event-local days
  // (20:00 Amsterdam and 20:00 Los Angeles on the same date do not compete).
  const candidateDay = instantDayInZone(candidateStart, candidate.timezone);
  const eventDay = instantDayInZone(eventStart, candidate.timezone);
  if (candidateDay !== eventDay) return null;

  return { grade: "same-day", overlapMinutes: null };
}

/** Lowers a grade by one step; `same-day` is the floor. */
function downgradeGrade(grade: ConflictGrade): ConflictGrade {
  const index = CONFLICT_GRADE_ORDER.indexOf(grade);
  const nextIndex = Math.min(index + 1, CONFLICT_GRADE_ORDER.length - 1);
  return CONFLICT_GRADE_ORDER[nextIndex]!;
}

/**
 * Evaluates whether `corpusEvent` conflicts with `candidate`. Runs the
 * audience gate, then the catchment gate, then grades the time overlap;
 * a `related`-only audience match downgrades the resulting grade one step.
 * Returns `null` when any gate fails (no conflict).
 */
export function evaluateConflict(
  candidate: ConflictCandidate,
  corpusEvent: CorpusEvent,
  relatedIdSet: Set<number>,
): ConflictVerdict | null {
  const audienceMatch = resolveAudienceMatch(
    candidate,
    corpusEvent,
    relatedIdSet,
  );
  if (!audienceMatch) return null;

  if (!passesCatchmentGate(candidate, corpusEvent)) return null;

  const timeResult = computeTimeGrade(candidate, corpusEvent);
  if (!timeResult) return null;

  const grade =
    audienceMatch === "related"
      ? downgradeGrade(timeResult.grade)
      : timeResult.grade;

  return {
    event: corpusEvent,
    grade,
    audienceMatch,
    tentative: corpusEvent.tentative,
    overlapMinutes: timeResult.overlapMinutes,
  };
}
