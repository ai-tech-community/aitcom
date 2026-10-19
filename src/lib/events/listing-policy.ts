import { eventDayParts, formatEventDayRange } from "@/lib/event-time";

/**
 * Internal notes about how AIT lists an event. They are writing guidance for
 * scouts and editors, not facts about the event, and they must not be stored
 * or shown as a public description.
 *
 * The Postgres pattern in `LISTING_POLICY_SQL` matches the same phrases so the
 * cleanup cron selects exactly the rows this stripper changes.
 */
const POLICY_PATTERNS: readonly RegExp[] = [
  /\bno invented\b/i,
  /\blisting policy\b/i,
  /\bverification notes?\b/i,
  /(?:^|\s)source\s*:/i,
  /\bhow ait lists\b/i,
  /\bhoe ait\b/i,
  /\bnot a summit ticket\b/i,
  /\bmember counts?\b/i,
  /\bgeen verzonnen\b/i,
  /\bjoining ait\b/i,
  /\bvoor ait\b/i,
  /\bsign up at\s+\/(?:en|nl)\/join\b/i,
  /\/(?:en|nl)\/join\b/i,
  // "for AIT Community" / "for AIT because" are listing notes.
  // "for AIT product" is the event itself.
  /\bfor ait\b(?!\s+product\b)/i,
  /\bait community['’]s\b/i,
  /\bait community members\b/i,
  /\bwith ait community\b/i,
  /\bfits ait community\b/i,
  /\bait should\b/i,
  /\bait['’]s event/i,
  /\bait events\b/i,
  /\bevents page\b/i,
  /\bevent inventory\b/i,
  /\bevents map\b/i,
  /\bradar event\b/i,
  /\bbuild density\b/i,
  /\bcommunity density\b/i,
  /\bkind of\b[^.]{0,80}\b(?:event|topic)\b/i,
  /\bthematic fit\b/i,
  /\bait fit\b/i,
  /\baligned with ait\b/i,
  /\brelevant (?:to|for) ait\b/i,
  /\buseful for ait\b/i,
  /\bmatches for ait\b/i,
  /\bevent matches for\b/i,
  /\bbroadening ait\b/i,
  /\bbroaden the events\b/i,
  /\bevent mix\b/i,
  /\bgeneral-audience listing\b/i,
  /\bsummit listing\b/i,
  /\bbest treated as\b/i,
  /\bthicken the\b/i,
  /\bmakes the ait\b/i,
  /\bpeople lock\b/i,
];

/** POSIX regex for `~*`. Keep it aligned with `POLICY_PATTERNS`. */
export const LISTING_POLICY_SQL = String.raw`\yno invented\y|\ylisting policy\y|\yverification notes?\y|(^|[^[:alnum:]])source[[:space:]]*:|\yhow ait lists\y|\yhoe ait\y|\ynot a summit ticket\y|\ymember counts?\y|\ygeen verzonnen\y|\yjoining ait\y|\yvoor ait\y|\ysign up at[[:space:]]+/(en|nl)/join\y|/(en|nl)/join|\yfor ait\y(?![[:space:]]+product\y)|\yait community['’]s\y|\yait community members\y|\ywith ait community\y|\yfits ait community\y|\yait should\y|\yait['’]s event\y|\yait events\y|\yevents page\y|\yevent inventory\y|\yevents map\y|\yradar event\y|\ybuild density\y|\ycommunity density\y|\ykind of\y[^.]{0,80}\y(event|topic)\y|\ythematic fit\y|\yait fit\y|\yaligned with ait\y|\yrelevant (to|for) ait\y|\yuseful for ait\y|\ymatches for ait\y|\yevent matches for\y|\ybroadening ait\y|\ybroaden the events\y|\yevent mix\y|\ygeneral-audience listing\y|\ysummit listing\y|\ybest treated as\y|\ythicken the\y|\ymakes the ait\y|\ypeople lock\y`;

const META_MAX = 320;

export function hasListingPolicy(text: string): boolean {
  return POLICY_PATTERNS.some((pattern) => pattern.test(text));
}

function salvageSentence(sentence: string): string {
  const trimmed = sentence.trim();
  if (!trimmed || !hasListingPolicy(trimmed)) return trimmed;
  // A labeled note is the note, including whatever follows the colon.
  if (/^(source|listing policy|verification notes?)\s*:/i.test(trimmed)) {
    return "";
  }

  const separators = [": ", " because ", " — ", " – ", " - "];
  for (const separator of separators) {
    const index = trimmed.indexOf(separator);
    if (index === -1) continue;
    const left = trimmed.slice(0, index).trim();
    const right = trimmed.slice(index + separator.length).trim();
    if (left && !hasListingPolicy(left) && hasListingPolicy(right)) return left;
    if (right && hasListingPolicy(left) && !hasListingPolicy(right)) {
      return right;
    }
  }

  let kept: string | null = null;
  let from = 0;
  while (from < trimmed.length) {
    const index = trimmed.indexOf(", ", from);
    if (index === -1) break;
    const left = trimmed.slice(0, index).trim();
    const right = trimmed.slice(index + 2).trim();
    if (
      left.length >= 20 &&
      !hasListingPolicy(left) &&
      hasListingPolicy(right)
    ) {
      kept = left;
    }
    from = index + 2;
  }
  return kept ?? "";
}

function stripLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (/^(source|listing policy|verification notes?)\s*:/i.test(trimmed)) {
    return "";
  }
  return trimmed
    .split(/(?<=[.!?])\s+/)
    .map(salvageSentence)
    .filter((sentence) => sentence.length > 0)
    .join(" ");
}

/**
 * Remove listing-policy notes from plain text. Factual sentences stay.
 * A second pass returns the same string.
 */
export function stripListingPolicy(text: string): string {
  return text
    .split(/\n\n+/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map(stripLine)
        .filter((line) => line.length > 0)
        .join("\n"),
    )
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .join("\n\n");
}

export type EventMetaSource = {
  title: string;
  date?: string | null;
  endDate?: string | null;
  city?: string | null;
  location?: string | null;
  format?: string | null;
  summary?: string | null;
  description?: string | null;
};

function cleanPlace(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function isBlankPlace(value: string): boolean {
  return /^(tba|tbd|n\/a|na|-)$/i.test(value);
}

function isOnlinePlace(value: string): boolean {
  return /^online$/i.test(value);
}

/**
 * Where the event happens, from stored place fields only.
 * Online when the format or the place says so and there is no venue.
 */
export function eventWhereLabel(event: EventMetaSource): string | null {
  const location = cleanPlace(event.location);
  const city = cleanPlace(event.city);
  const venue =
    location && !isBlankPlace(location) && !isOnlinePlace(location)
      ? location
      : "";
  const town = city && !isBlankPlace(city) && !isOnlinePlace(city) ? city : "";
  if (venue) {
    if (town && !venue.toLowerCase().includes(town.toLowerCase())) {
      return `${venue}, ${town}`;
    }
    return venue;
  }
  const online =
    event.format === "online" || isOnlinePlace(location) || isOnlinePlace(city);
  if (online) return "Online";
  return town || null;
}

function eventWhenLabel(event: EventMetaSource, locale: string): string | null {
  const date = event.date?.trim();
  if (!date || !eventDayParts(date, locale)) return null;
  const label = formatEventDayRange(date, event.endDate, locale);
  return label.trim() || null;
}

function sentence(value: string): string {
  return value.trim().replace(/[.]+$/g, "").trim();
}

function joinSentences(parts: readonly string[]): string {
  const text = parts
    .map(sentence)
    .filter((part) => part.length > 0)
    .join(". ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.endsWith(".") ? text : `${text}.`;
}

function lastSentenceBoundary(text: string): number {
  let boundary = -1;
  for (const match of text.matchAll(/[.!?](?=\s|$)/g)) {
    boundary = match.index ?? boundary;
  }
  return boundary;
}

function capMeta(facts: string, about: string): string {
  const base = joinSentences([facts]);
  if (!about) return base;
  const room = META_MAX - base.length - 1;
  if (room < 40) return base;
  let extra = about.replace(/\s+/g, " ").trim();
  if (extra.length > room) {
    const boundary = lastSentenceBoundary(extra.slice(0, room));
    if (boundary < 40) return base;
    extra = extra.slice(0, boundary + 1).trim();
  }
  return joinSentences([base, extra]);
}

/**
 * Public meta description: the event's name, when, and where, then its own
 * description with listing-policy notes removed. Missing fields are omitted.
 */
export function eventMetaDescription(
  event: EventMetaSource,
  locale: string,
): string {
  const title = event.title.trim();
  const when = eventWhenLabel(event, locale);
  const where = eventWhereLabel(event);
  const description = stripListingPolicy(event.description ?? "").trim();
  const summary = stripListingPolicy(event.summary ?? "").trim();
  let about = description || summary;
  if (about.toLowerCase() === title?.toLowerCase()) {
    about = "";
  }
  const facts = [title, when ?? "", where ?? ""].filter(
    (part) => part.length > 0,
  );
  return capMeta(joinSentences(facts), about);
}
