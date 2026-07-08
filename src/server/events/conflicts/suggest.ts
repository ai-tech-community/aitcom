/**
 * Suggested-slot ranking for the scheduling-conflict engine. Given a
 * candidate event, the surrounding corpus, and the target audiences'
 * [[preferred-time-slot]]s, proposes alternative (date, startTime, endTime)
 * slots near the organizer's chosen date, ranked best-first.
 *
 * Pure module (ADR-0035 posture, same as rule.ts): no Payload imports, no
 * I/O, no `Date.now()` / argless `new Date()` — anything time-relative comes
 * in through the injected `now` parameter, so identical input always yields
 * identical output.
 */

import { WEEKDAY_VALUES, type Weekday } from "@/lib/audience-seed";
import { eventWallTimeToUtc, instantToZonedDateString } from "@/lib/event-time";

import {
  evaluateConflict,
  type ConflictCandidate,
  type CorpusEvent,
} from "./rule";

export interface SlotSuggestion {
  date: string; // YYYY-MM-DD in the event's timezone
  startTime: string; // "HH:MM"
  endTime: string;
  reasons: string[]; // machine-readable: "clear", "preferred:<audience-slug>", "original-time"
  dayOffset: number; // signed days from the organizer's chosen date
}

export interface SuggestSlotsAudience {
  id: number;
  slug: string;
  preferredSlots: { weekdays: Weekday[]; startTime: string; endTime: string }[];
}

const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_MAX_RESULTS = 5;

/** Calendar-date key (YYYY-MM-DD) taken directly from the authoritative `date` field. */
function calendarDateKey(date: string): string {
  return date.split("T")[0] ?? date;
}

/** Pure calendar arithmetic on a YYYY-MM-DD key; timezone-independent by construction. */
function addDays(dateKey: string, days: number): string {
  const [y = NaN, m = NaN, d = NaN] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().split("T")[0]!;
}

const weekdayFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getWeekdayFormatter(timeZone: string): Intl.DateTimeFormat {
  let cached = weekdayFormatterCache.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone });
    weekdayFormatterCache.set(timeZone, cached);
  }
  return cached;
}

/**
 * Weekday of an event-local calendar date. Anchors the date at 12:00 in the
 * event's timezone (via `eventWallTimeToUtc`) and reads the weekday back in
 * that same zone, so the result is the weekday of the local calendar date —
 * never shifted by a midnight-UTC projection (a `new Date("YYYY-MM-DD")`
 * instant formatted in a negative-offset zone lands on the previous day).
 * Noon also sidesteps zones whose DST transitions skip midnight.
 */
function weekdayOfDateInZone(dateKey: string, timezone: string): Weekday {
  const noonInstant = eventWallTimeToUtc(dateKey, "12:00", timezone);
  const label = getWeekdayFormatter(timezone).format(noonInstant).toLowerCase();
  const weekday = WEEKDAY_VALUES.find((value) => value === label);
  if (!weekday) {
    // Unreachable with the en-US locale (Mon/Tue/.../Sun), kept as a
    // deterministic guard rather than a silent wrong match.
    throw new Error(`Unrecognized weekday label "${label}" for ${dateKey}`);
  }
  return weekday;
}

interface WorkingSlot {
  date: string;
  startTime: string;
  endTime: string;
  reasons: string[];
  dayOffset: number;
  /** Came from at least one audience preferred slot (ranks above pure original-time fallbacks). */
  preferred: boolean;
  /** Zero conflict verdicts against the corpus (set during scoring). */
  clear: boolean;
}

/**
 * Generates, scores, and ranks alternative slots for `candidate`.
 *
 * Generation: every day in `[chosenDate - windowDays, chosenDate + windowDays]`
 * — skipping days strictly before `now`'s calendar date in the event's
 * timezone — yields (a) each target audience preferred slot whose weekdays
 * include that day's event-local weekday, and (b) the organizer's original
 * start/end times as an `original-time` fallback (only when both are set).
 * The exact original (date, startTime, endTime) triple is excluded, and
 * identical triples are de-duped with their reasons merged.
 *
 * Scoring: each slot is evaluated against the whole corpus with
 * `evaluateConflict`; any `clash` or `same-evening` verdict discards it,
 * zero verdicts marks it `clear`, and `same-day`-only slots survive but rank
 * below clear ones. Ranking: clear > same-day-only, then preferred >
 * original-time-only, then smaller `|dayOffset|`, earlier date, earlier
 * startTime. Returns the top `maxResults`.
 */
export function suggestSlots(input: {
  candidate: ConflictCandidate;
  corpus: CorpusEvent[];
  relatedIdSet: Set<number>;
  audiences: SuggestSlotsAudience[];
  now: Date;
  windowDays?: number; // default 7
  maxResults?: number; // default 5
}): SlotSuggestion[] {
  const {
    candidate,
    corpus,
    relatedIdSet,
    audiences,
    now,
    windowDays = DEFAULT_WINDOW_DAYS,
    maxResults = DEFAULT_MAX_RESULTS,
  } = input;

  const chosenDateKey = calendarDateKey(candidate.date);
  const todayKey = instantToZonedDateString(
    now.toISOString(),
    candidate.timezone,
  );
  const targetAudienceIds = new Set(candidate.audienceIds);
  const targetAudiences = audiences.filter((audience) =>
    targetAudienceIds.has(audience.id),
  );

  // The organizer's exact original slot is never suggested back. Only a full
  // (date, startTime, endTime) triple match is excluded — a preferred slot at
  // a different time on the chosen date is still a valid suggestion.
  const originalTripleKey =
    candidate.startTime && candidate.endTime
      ? `${chosenDateKey}|${candidate.startTime}|${candidate.endTime}`
      : null;

  const slotsByTriple = new Map<string, WorkingSlot>();

  const upsertSlot = (
    date: string,
    dayOffset: number,
    startTime: string,
    endTime: string,
    reason: string,
    preferred: boolean,
  ): void => {
    const tripleKey = `${date}|${startTime}|${endTime}`;
    if (tripleKey === originalTripleKey) return;
    const existing = slotsByTriple.get(tripleKey);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      existing.preferred = existing.preferred || preferred;
      return;
    }
    slotsByTriple.set(tripleKey, {
      date,
      startTime,
      endTime,
      reasons: [reason],
      dayOffset,
      preferred,
      clear: false,
    });
  };

  for (let dayOffset = -windowDays; dayOffset <= windowDays; dayOffset++) {
    const dateKey = addDays(chosenDateKey, dayOffset);
    // "Strictly before now" compares event-local calendar dates, not raw
    // instants: a slot later today (in the event's zone) is still offered.
    if (dateKey < todayKey) continue;

    const weekday = weekdayOfDateInZone(dateKey, candidate.timezone);
    for (const audience of targetAudiences) {
      for (const slot of audience.preferredSlots) {
        if (!slot.weekdays.includes(weekday)) continue;
        upsertSlot(
          dateKey,
          dayOffset,
          slot.startTime,
          slot.endTime,
          `preferred:${audience.slug}`,
          true,
        );
      }
    }

    // Original-time fallback on each day (the chosen date itself is caught by
    // the exact-triple exclusion above). Needs both times: a suggestion must
    // carry a concrete start and end.
    if (candidate.startTime && candidate.endTime) {
      upsertSlot(
        dateKey,
        dayOffset,
        candidate.startTime,
        candidate.endTime,
        "original-time",
        false,
      );
    }
  }

  const survivors: WorkingSlot[] = [];
  for (const slot of slotsByTriple.values()) {
    const slotCandidate: ConflictCandidate = {
      ...candidate,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    };

    let blocked = false;
    let hasVerdict = false;
    for (const corpusEvent of corpus) {
      const verdict = evaluateConflict(
        slotCandidate,
        corpusEvent,
        relatedIdSet,
      );
      if (!verdict) continue;
      hasVerdict = true;
      if (verdict.grade === "clash" || verdict.grade === "same-evening") {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    slot.clear = !hasVerdict;
    if (slot.clear) slot.reasons.push("clear");
    survivors.push(slot);
  }

  survivors.sort(
    (a, b) =>
      Number(b.clear) - Number(a.clear) ||
      Number(b.preferred) - Number(a.preferred) ||
      Math.abs(a.dayOffset) - Math.abs(b.dayOffset) ||
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.endTime.localeCompare(b.endTime),
  );

  return survivors.slice(0, maxResults).map((slot) => ({
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    reasons: slot.reasons,
    dayOffset: slot.dayOffset,
  }));
}
