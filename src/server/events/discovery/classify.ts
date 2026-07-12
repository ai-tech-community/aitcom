/**
 * Pure heuristic audience classifier for discovered (ingested) events.
 *
 * Slice K (event scheduling conflicts initiative, K-T1 / #199): maps an
 * externally-sourced event's free text onto the Hub audience vocabulary
 * (CONTEXT.md [[audience]]) without an LLM. There is no LLM anywhere in
 * this codebase and none is to be added here — this is keyword/token
 * matching only. No I/O, no Date, fully deterministic.
 *
 * Matching rules:
 * - The event's title, description, and location are lowercased, stripped
 *   of punctuation, and joined into one normalized string; splitting that
 *   string on whitespace yields a token set.
 * - A single-word interest tag matches if it appears as a whole token in
 *   that set (avoids false positives like "ai" inside "explain").
 * - A multi-word interest tag ("product management") matches if it appears
 *   as an adjacent phrase (substring) in the normalized joined text, since
 *   the token set alone loses word adjacency.
 * - An audience additionally matches if its `name` or `slug` appears
 *   verbatim (substring) in the normalized joined text (e.g. title contains
 *   "founders"). This is the only way an audience with empty `interests`
 *   (several seed audiences have none — see src/lib/audience-seed.ts) can
 *   ever match; that seed-data gap is a content follow-up, not something
 *   this classifier can fix.
 *
 * Confidence formula (documented, deterministic, bounded to [0, 1]):
 *   confidence = min(1, totalHits / 3)
 * where totalHits sums, across every *matched* audience, the number of its
 * interest tags that hit plus 1 more if its name/slug also matched. Three
 * or more combined hits across all matched audiences saturates confidence
 * at 1. No match at all yields confidence 0. This is monotonic in the hit
 * count and cheap to reason about; it deliberately does not try to be a
 * probability — it only feeds the dormant `confidenceScore` field as a
 * coarse triage signal for human review.
 */

export interface ClassifiableAudience {
  id: number;
  slug: string;
  name: string;
  interests: string[];
}

export interface ClassificationResult {
  /** All matching audience ids, in the same order as the input array. */
  audienceIds: number[];
  /** Bounded confidence score in [0, 1]. */
  confidence: number;
}

const HITS_FOR_FULL_CONFIDENCE = 3;

/** Lowercase, strip punctuation, and collapse to single-space-joined words. */
function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
    .join(" ");
}

function tokenSetOf(normalized: string): Set<string> {
  return new Set(normalized.length > 0 ? normalized.split(" ") : []);
}

/** Counts how many of an audience's interest tags hit the given text. */
function countInterestHits(
  interests: string[],
  joinedText: string,
  tokens: Set<string>,
): number {
  let hits = 0;
  for (const interest of interests) {
    const normalizedInterest = normalizeText(interest);
    if (normalizedInterest.length === 0) continue;

    const isPhrase = normalizedInterest.includes(" ");
    const matched = isPhrase
      ? joinedText.includes(normalizedInterest)
      : tokens.has(normalizedInterest);
    if (matched) hits += 1;
  }
  return hits;
}

function nameOrSlugMatches(
  audience: ClassifiableAudience,
  joinedText: string,
): boolean {
  const normalizedName = normalizeText(audience.name);
  const normalizedSlug = normalizeText(audience.slug);
  return (
    (normalizedName.length > 0 && joinedText.includes(normalizedName)) ||
    (normalizedSlug.length > 0 && joinedText.includes(normalizedSlug))
  );
}

export function classifyAudiences(
  text: {
    title: string;
    description?: string | null;
    location?: string | null;
  },
  audiences: ClassifiableAudience[],
): ClassificationResult {
  const joinedText = normalizeText(
    [text.title, text.description ?? "", text.location ?? ""].join(" "),
  );
  const tokens = tokenSetOf(joinedText);

  const audienceIds: number[] = [];
  let totalHits = 0;

  for (const audience of audiences) {
    const interestHits = countInterestHits(
      audience.interests,
      joinedText,
      tokens,
    );
    const identityHit = nameOrSlugMatches(audience, joinedText) ? 1 : 0;
    const hits = interestHits + identityHit;

    if (hits > 0) {
      audienceIds.push(audience.id);
      totalHits += hits;
    }
  }

  if (audienceIds.length === 0) {
    return { audienceIds: [], confidence: 0 };
  }

  return {
    audienceIds,
    confidence: Math.min(1, totalHits / HITS_FOR_FULL_CONFIDENCE),
  };
}
