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

import { eventWallTimeToUtc } from "@/lib/event-time";
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

/** Most severe first — used for sorting verdict lists. */
export const CONFLICT_GRADE_ORDER: ConflictGrade[] = [
  "clash",
  "same-evening",
  "same-day",
];

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
 * semantics (same calendar day or nothing). Otherwise both intervals are
 * built (defaulting a missing `endTime` to a 120-minute duration), padded
 * +-60 minutes when either side is in-person/hybrid, and tested for overlap.
 * A padded overlap is a `clash` (reporting the raw, unpadded overlap in
 * minutes, floored at 0). Failing that, same calendar day with a
 * start-to-start gap of at most 4 hours is `same-evening`, otherwise
 * `same-day`; different calendar days produce no conflict.
 */
function computeTimeGrade(
  candidate: TimeFields,
  event: TimeFields,
): TimeGradeResult | null {
  if (!candidate.startTime || !event.startTime) {
    if (!sameCalendarDay(candidate.date, event.date)) return null;
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

  if (!sameCalendarDay(candidate.date, event.date)) return null;

  const startGapMs = Math.abs(candidateStart - eventStart);
  return {
    grade: startGapMs <= SAME_EVENING_GAP_MS ? "same-evening" : "same-day",
    overlapMinutes: null,
  };
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
