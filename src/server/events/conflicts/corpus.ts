/**
 * Payload-facing half of the scheduling-conflict engine: resolves the target
 * [[audience]] slugs (with symmetric [[related-audience]] expansion) and
 * fetches the candidate corpus of nearby events, then shapes verdicts for the
 * wire with [[tentative-hold]] anonymization applied.
 *
 * All Payload access for the conflict-check path lives here — `rule.ts` and
 * `suggest.ts` stay pure (ADR-0035: no live external API calls anywhere in
 * the check path; this module's own I/O is a local Payload read, never an
 * outbound call). Exceptions from `payload.find` bubble to the router
 * uncaught — no `log`-and-swallow here.
 */

import type { Payload } from "payload";

import { DEFAULT_EVENT_TIMEZONE } from "@/lib/event-time";
import type { Weekday } from "@/lib/audience-seed";
import type { ConflictGrade, ConflictVerdict, CorpusEvent } from "./rule";
import { DEFAULT_WINDOW_DAYS } from "./suggest";

export interface ExpandedAudience {
  id: number;
  slug: string;
  name: string;
  preferredSlots: { weekdays: Weekday[]; startTime: string; endTime: string }[];
}

export interface ExpandAudiencesResult {
  direct: ExpandedAudience[];
  relatedIdSet: Set<number>;
}

/**
 * Resolves `slugs` to their `audiences` docs (dropping unknown slugs, Slice G
 * convention) and computes the symmetric closure of `relatedAudiences`
 * across the whole collection: an id lands in `relatedIdSet` when either a
 * direct audience lists it, or a non-direct audience lists a direct id
 * (the field is documented bidirectional even though stored one-way).
 *
 * Two queries at most: the direct `slug: { in }` lookup, and — only when at
 * least one slug matched — a single `find` over the whole (tiny, ≤ dozens)
 * `audiences` collection to compute both expansion directions in code.
 */
export async function expandAudiences(
  payload: Payload,
  slugs: string[],
): Promise<ExpandAudiencesResult> {
  if (slugs.length === 0) return { direct: [], relatedIdSet: new Set() };

  const { docs: directDocs } = await payload.find({
    collection: "audiences",
    where: { slug: { in: slugs } },
    depth: 0,
    limit: slugs.length,
  });

  if (directDocs.length === 0) return { direct: [], relatedIdSet: new Set() };

  const direct: ExpandedAudience[] = directDocs.map((doc) => ({
    id: doc.id,
    slug: doc.slug,
    name: doc.name,
    preferredSlots: (doc.preferredSlots ?? []).map((slot) => ({
      weekdays: slot.weekdays,
      startTime: slot.startTime,
      endTime: slot.endTime,
    })),
  }));
  const directIds = new Set(direct.map((audience) => audience.id));

  const { docs: allDocs } = await payload.find({
    collection: "audiences",
    depth: 0,
    limit: 1000,
  });

  const relatedIdSet = new Set<number>();
  for (const doc of allDocs) {
    const relatedIds = (doc.relatedAudiences ?? []).map((related) =>
      typeof related === "object" ? related.id : related,
    );
    if (directIds.has(doc.id)) {
      // Forward direction: a direct audience lists these as related.
      for (const relatedId of relatedIds) {
        if (!directIds.has(relatedId)) relatedIdSet.add(relatedId);
      }
    } else if (relatedIds.some((relatedId) => directIds.has(relatedId))) {
      // Reverse direction: a non-direct audience lists a direct id — the
      // link is bidirectional by contract even though stored one-way.
      relatedIdSet.add(doc.id);
    }
  }

  return { direct, relatedIdSet };
}

export interface FetchCorpusParams {
  dateFrom: string;
  dateTo: string;
  audienceIdsExpanded: number[];
  excludeEventId?: number;
}

/**
 * Fetches the candidate corpus: published or draft (tentative) events inside
 * the date window that reach any of `audienceIdsExpanded` and have cleared
 * curation (`reviewStatus` approved, or unset on legacy rows). A single
 * indexed `payload.find` — no per-event follow-up queries.
 */
export async function fetchCorpus(
  payload: Payload,
  { dateFrom, dateTo, audienceIdsExpanded, excludeEventId }: FetchCorpusParams,
): Promise<CorpusEvent[]> {
  const { docs } = await payload.find({
    collection: "events",
    draft: false,
    depth: 0,
    limit: 300,
    where: {
      and: [
        { date: { greater_than_equal: dateFrom } },
        { date: { less_than_equal: dateTo } },
        { status: { in: ["published", "draft"] } },
        {
          or: [
            { reviewStatus: { equals: "approved" } },
            { reviewStatus: { exists: false } },
          ],
        },
        { audience: { in: audienceIdsExpanded } },
        ...(excludeEventId != null
          ? [{ id: { not_equals: excludeEventId } }]
          : []),
      ],
    },
  });

  return docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    date: doc.date,
    startTime: doc.startTime ?? null,
    endTime: doc.endTime ?? null,
    timezone: doc.timezone ?? DEFAULT_EVENT_TIMEZONE,
    // Online is the conservative widest-competition default: an event with
    // no recorded format is treated as competing with everything.
    format: doc.format ?? "online",
    city: doc.city ?? null,
    latitude: doc.latitude ?? null,
    longitude: doc.longitude ?? null,
    audienceIds: Array.isArray(doc.audience)
      ? doc.audience.map((entry) =>
          typeof entry === "object" ? entry.id : entry,
        )
      : [],
    tentative: doc.status === "draft",
    sourceUrl: doc.sourceUrl ?? null,
    communityId: doc.communityId ?? null,
  }));
}

// Mirrors suggest.ts's scan window so a single corpus fetch always covers
// every alternative slot `suggestSlots` might score (see corpusDateWindow).
const CORPUS_WINDOW_DAYS = DEFAULT_WINDOW_DAYS;
const CORPUS_WINDOW_BUFFER_DAYS = 1;

/** Calendar-date key (YYYY-MM-DD) taken directly from the authoritative `date` field. */
function calendarDateKey(date: string): string {
  return date.split("T")[0] ?? date;
}

/** Pure calendar arithmetic on a YYYY-MM-DD key; timezone-independent by construction (mirrors suggest.ts's addDays). */
function addDays(dateKey: string, days: number): string {
  const [y = NaN, m = NaN, d = NaN] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().split("T")[0]!;
}

/**
 * `fetchCorpus`'s `[dateFrom, dateTo]` window around the organizer's chosen
 * date: candidate date ± (`suggestSlots`'s default 7-day scan window + 1 day
 * buffer), so a single corpus fetch covers both the direct conflict check
 * and every alternative slot `suggestSlots` might score.
 */
export function corpusDateWindow(candidateDate: string): {
  dateFrom: string;
  dateTo: string;
} {
  const key = calendarDateKey(candidateDate);
  const span = CORPUS_WINDOW_DAYS + CORPUS_WINDOW_BUFFER_DAYS;
  return { dateFrom: addDays(key, -span), dateTo: addDays(key, span) };
}

export interface TentativeWireConflict {
  tentative: true;
  grade: ConflictGrade;
  audienceMatch: "direct" | "related";
  date: string; // YYYY-MM-DD only — no other identifying field
  sourceType: "hold";
}

export interface RevealedWireConflict {
  tentative: false;
  grade: ConflictGrade;
  audienceMatch: "direct" | "related";
  overlapMinutes: number | null;
  id: number;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  sourceType: "native" | "import";
  sourceUrl: string | null;
}

export type WireConflict = TentativeWireConflict | RevealedWireConflict;

/**
 * Shapes a `ConflictVerdict` for the wire, anonymizing [[tentative-hold]]
 * events server-side: a tentative verdict exposes only its grade, audience
 * match, and calendar date — never the id, title, times, communityId, or
 * sourceUrl that would let a caller identify (or scrape) someone else's
 * unapproved submission. Non-tentative verdicts pass their full identifying
 * fields through, tagged `sourceType: "import"` when they carry a
 * `sourceUrl` and `"native"` otherwise.
 */
export function toWireConflict(verdict: ConflictVerdict): WireConflict {
  const { event, grade, audienceMatch, tentative, overlapMinutes } = verdict;

  if (tentative) {
    return {
      tentative: true,
      grade,
      audienceMatch,
      date: calendarDateKey(event.date),
      sourceType: "hold",
    };
  }

  return {
    tentative: false,
    grade,
    audienceMatch,
    overlapMinutes,
    id: event.id,
    title: event.title,
    date: event.date,
    startTime: event.startTime ?? null,
    endTime: event.endTime ?? null,
    timezone: event.timezone,
    sourceType: event.sourceUrl ? "import" : "native",
    sourceUrl: event.sourceUrl ?? null,
  };
}
