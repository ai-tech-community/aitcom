import { eventDayParts, formatEventDayRange } from "@/lib/event-time";

/**
 * Notes that must not be stored or shown as a public description:
 * listing-policy instructions, scout curation, and the dropped-accent
 * token left when "métier" was stored as U+FFFD or as "mtier".
 *
 * `LISTING_POLICY_SQL` matches the same phrases so the cleanup cron selects
 * exactly the rows this stripper changes.
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

/** Editorial scout voice. A sentence that has any of these is not a public fact. */
const CURATION_PATTERNS: readonly RegExp[] = [
  /\bpositioned\b/i,
  /\bone of the\b/i,
  /\bkey signal\b/i,
  /\bnot the most\b/i,
  /\bhigh-signal\b|\bhigh\s+signal\b/i,
  /\bhighly relevant\b/i,
  /\brelevant for members\b/i,
  /\bfor members\b/i,
  /\binstead of generic\b/i,
  /\bgeneric hype\b/i,
  /\bgeneric innovation\b/i,
  /\bremains one of\b/i,
  /\bone of the (?:strongest|most|leading|top|best)\b/i,
  /\bthe top event\b/i,
  /\bstrong source\b/i,
  /\ba real (?:local|belgian|eindhoven)\b/i,
  /\bstrong fit\b/i,
  /\bgood fit\b/i,
  /\bwell aligned\b/i,
  /\bthematic fit\b/i,
  /\bexactly the kind\b/i,
  /\bwe want\b/i,
  /\bnotable because\b/i,
  /\bthrough the lens\b/i,
  /\bgrounded (?:local|in)\b/i,
  /\bfashionable\b/i,
  /\bstill relevant\b/i,
  /\brecognizable\b/i,
  /\bbroader event than\b/i,
  /\bhigh-value\b/i,
  /\bstrong (?:local|regional|ecosystem|technical)\b/i,
  /\bflagship\b/i,
  /\bofficial(?:\s+\d{4})?\s+page\b/i,
  /\boffici[eë]le\s+pagina\b/i,
  /\blists dates\b/i,
];

const ENCODING_PATTERN = /m\uFFFDtier|\bmtier\b/i;

/** POSIX regex for `~*`. Keep it aligned with the patterns above. */
export const LISTING_POLICY_SQL = String.raw`\yno invented\y|\ylisting policy\y|\yverification notes?\y|(^|[^[:alnum:]])source[[:space:]]*:|\yhow ait lists\y|\yhoe ait\y|\ynot a summit ticket\y|\ymember counts?\y|\ygeen verzonnen\y|\yjoining ait\y|\yvoor ait\y|\ysign up at[[:space:]]+/(en|nl)/join\y|/(en|nl)/join|\yfor ait\y(?![[:space:]]+product\y)|\yait community['’]s\y|\yait community members\y|\ywith ait community\y|\yfits ait community\y|\yait should\y|\yait['’]s event\y|\yait events\y|\yevents page\y|\yevent inventory\y|\yevents map\y|\yradar event\y|\ybuild density\y|\ycommunity density\y|\ykind of\y[^.]{0,80}\y(event|topic)\y|\ythematic fit\y|\yait fit\y|\yaligned with ait\y|\yrelevant (to|for) ait\y|\yuseful for ait\y|\ymatches for ait\y|\yevent matches for\y|\ybroadening ait\y|\ybroaden the events\y|\yevent mix\y|\ygeneral-audience listing\y|\ysummit listing\y|\ybest treated as\y|\ythicken the\y|\ymakes the ait\y|\ypeople lock\y|\ypositioned\y|\yone of the\y|\ykey signal\y|\ynot the most\y|\yhigh-signal\y|\yhigh[[:space:]]+signal\y|\yhighly relevant\y|\yrelevant for members\y|\yfor members\y|\yinstead of generic\y|\ygeneric hype\y|\ygeneric innovation\y|\yremains one of\y|\yone of the (strongest|most|leading|top|best)\y|\ythe top event\y|\ystrong source\y|\ya real (local|belgian|eindhoven)\y|\ystrong fit\y|\ygood fit\y|\ywell aligned\y|\yexactly the kind\y|\ywe want\y|\ynotable because\y|\ythrough the lens\y|\ygrounded (local|in)\y|\yfashionable\y|\ystill relevant\y|\yrecognizable\y|\ybroader event than\y|\yhigh-value\y|\ystrong (local|regional|ecosystem|technical)\y|\yflagship\y|\yofficial([[:space:]]+[0-9]{4})?[[:space:]]+page\y|\yoffici[eë]le[[:space:]]+pagina\y|\ylists dates\y|m�tier|\ymtier\y`;

const META_MAX = 160;

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function hasListingPolicy(text: string): boolean {
  return (
    ENCODING_PATTERN.test(text) ||
    matchesAny(text, POLICY_PATTERNS) ||
    matchesAny(text, CURATION_PATTERNS)
  );
}

/**
 * Put "métier" back when the é was stored as U+FFFD or dropped entirely.
 * Other words are left alone.
 */
export function repairEventEncoding(text: string): string {
  return text
    .replace(/m\uFFFDtier/gi, (match) =>
      match.startsWith("M") ? "Métier" : "métier",
    )
    .replace(/\bmtier\b/gi, (match) =>
      match.startsWith("M") ? "Métier" : "métier",
    );
}

function startsSentence(value: string): boolean {
  return /^[\p{Lu}\d]/u.test(value);
}

function hasEditorial(text: string): boolean {
  return (
    matchesAny(text, POLICY_PATTERNS) || matchesAny(text, CURATION_PATTERNS)
  );
}

function salvageClause(sentence: string): string {
  const separators = [" — ", " – ", " - ", ": "];
  for (const separator of separators) {
    const index = sentence.indexOf(separator);
    if (index === -1) continue;
    const left = sentence.slice(0, index).trim();
    const right = sentence.slice(index + separator.length).trim();
    if (
      startsSentence(left) &&
      left.length >= 20 &&
      !hasEditorial(left) &&
      hasEditorial(right)
    ) {
      return left;
    }
  }
  return "";
}

function cleanSentence(sentence: string): string {
  const trimmed = sentence.trim();
  if (!trimmed) return "";
  if (/^(source|listing policy|verification notes?)\s*:/i.test(trimmed)) {
    return "";
  }
  if (!hasEditorial(trimmed)) return trimmed;
  if (!startsSentence(trimmed)) return "";
  return salvageClause(trimmed);
}

function lineChanged(line: string): { text: string; changed: boolean } {
  const trimmed = line.trim();
  if (!trimmed) return { text: "", changed: line.length > 0 };
  if (/^(source|listing policy|verification notes?)\s*:/i.test(trimmed)) {
    return { text: "", changed: true };
  }
  const cleaned = trimmed
    .split(/(?<=[.!?])\s+/)
    .map(cleanSentence)
    .filter((sentence) => sentence.length > 0)
    .join(" ");
  return { text: cleaned, changed: cleaned !== trimmed };
}

/**
 * Remove listing-policy notes and scout curation. Fragments of a note are
 * dropped. Text with no note is returned unchanged, including its spacing.
 * A second pass returns the same string.
 */
export function stripListingPolicy(text: string): string {
  const repaired = repairEventEncoding(text);
  let changed = repaired !== text;
  const paragraphs = repaired.split(/\n\n+/).map((paragraph) => {
    const lines = paragraph.split("\n").map((line) => {
      const next = lineChanged(line);
      if (next.changed) changed = true;
      return next.text;
    });
    return lines.filter((line) => line.length > 0).join("\n");
  });
  if (!changed) return text;
  return paragraphs
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

function withPeriod(value: string): string {
  const trimmed = value
    .trim()
    .replace(/[.!?]+$/g, "")
    .trim();
  return trimmed ? `${trimmed}.` : "";
}

function fitFacts(parts: readonly string[]): string {
  let result = "";
  for (const part of parts) {
    const piece = withPeriod(part);
    if (!piece) continue;
    const next = result ? `${result} ${piece}` : piece;
    if (next.length > META_MAX) break;
    result = next;
  }
  if (result) return result;
  const title = parts[0]?.trim() ?? "";
  if (!title) return "";
  const cut = title.slice(0, META_MAX - 1).replace(/\s+\S*$/, "");
  return withPeriod(cut || title.slice(0, META_MAX - 1));
}

function restatesSchedule(sentence: string): boolean {
  if (
    /\b(?:lists dates|will be held|takes place|official(?:\s+\d{4})?\s+page)\b/i.test(
      sentence,
    )
  ) {
    return true;
  }
  if (
    /\b(?:jan(?:uari|uary)?|feb(?:ruari|ruary)?|m(?:aa)?rt|mar(?:ch)?|apr(?:il)?|mei|jun(?:i|e)?|jul(?:i|y)?|aug(?:ustus|ust)?|sept?(?:ember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(
      sentence,
    )
  ) {
    return true;
  }
  if (
    /\b(?:\d{1,2}(?:st|nd|rd|th)?\s+may|may\s+\d{1,2}(?:st|nd|rd|th)?)\b/i.test(
      sentence,
    )
  ) {
    return true;
  }
  return (
    /\b\d{4}-\d{2}-\d{2}\b/.test(sentence) || /\b\d{1,2}:\d{2}\b/.test(sentence)
  );
}

/**
 * Standard Dutch names for seeded-event cities whose Dutch form differs
 * from the stored English name. `city` and `location` are not localized.
 * Edinburgh, New York, San Jose, San Francisco, Helsinki, Potsdam,
 * Barcelona, and the other seeded cities already match Dutch usage and
 * stay as stored. A venue proper name that only contains the city
 * ("STATION-Berlin", "Belgrade Fair", "InterContinental London") is left
 * intact; a comma-separated segment that is exactly the city is replaced.
 */
const DUTCH_CITY_NAMES: Readonly<Record<string, string>> = {
  Munich: "München",
  Vienna: "Wenen",
  Lisbon: "Lissabon",
  "The Hague": "Den Haag",
  Warsaw: "Warschau",
  Belgrade: "Belgrado",
  Strasbourg: "Straatsburg",
  Berlin: "Berlijn",
  Paris: "Parijs",
  London: "Londen",
};

function localizeCityField(
  value: string | null | undefined,
  locale: string,
): string | null | undefined {
  if (locale !== "nl" || value == null) return value;
  const trimmed = value.trim();
  const dutch = DUTCH_CITY_NAMES[trimmed];
  if (!dutch) return value;
  return value.replace(trimmed, dutch);
}

function localizeLocationField(
  value: string | null | undefined,
  locale: string,
): string | null | undefined {
  if (locale !== "nl" || !value) return value;
  let changed = false;
  const next = value.split(",").map((part) => {
    const trimmed = part.trim();
    const dutch = DUTCH_CITY_NAMES[trimmed];
    if (!dutch) return part;
    changed = true;
    return part.replace(trimmed, dutch);
  });
  return changed ? next.join(",") : value;
}

function localizeEventPlace(
  event: EventMetaSource,
  locale: string,
): EventMetaSource {
  if (locale !== "nl") return event;
  return {
    ...event,
    city: localizeCityField(event.city, locale),
    location: localizeLocationField(event.location, locale),
  };
}

function repeatsPlace(sentence: string, event: EventMetaSource): boolean {
  const haystack = sentence.toLowerCase();
  const needles = [event.location, event.city, eventWhereLabel(event)];
  return needles.some((value) => {
    const raw = value?.trim() ?? "";
    if (raw.length >= 4 && haystack.includes(raw.toLowerCase())) return true;
    const head = raw.split(",")[0]?.trim() ?? "";
    const tokens = head
      .split(/\s+/)
      .filter((token) => !/^(the|a|an)$/i.test(token));
    const short = tokens.slice(0, 2).join(" ").toLowerCase();
    return short.length >= 4 && haystack.includes(short);
  });
}

function topicSentences(description: string): string[] {
  return description
    .split(/\n\n+/)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Public meta description: "<name>. <date range>. <venue, city>."
 * Dutch uses the standard Dutch city name when the stored English name
 * differs. One neutral topic sentence from the description is added only
 * when it fits in 160 characters. A description that is curation, a
 * fragment, or a restatement of the date and venue contributes nothing.
 */
export function eventMetaDescription(
  event: EventMetaSource,
  locale: string,
): string {
  const title = repairEventEncoding(event.title.trim());
  const placeEvent = localizeEventPlace(event, locale);
  const when = eventWhenLabel(event, locale);
  const where = eventWhereLabel(placeEvent);
  const facts = fitFacts([title, when ?? "", where ?? ""]);
  const description = stripListingPolicy(event.description ?? "").replace(
    /\*+/g,
    "",
  );
  const titleKey = title.toLowerCase();
  for (const sentence of topicSentences(description)) {
    if (!startsSentence(sentence) || hasEditorial(sentence)) continue;
    if (
      /[?]$/.test(sentence) ||
      /^(?:no one|but some|thank you|for questions)\b/i.test(sentence) ||
      /@|please contact/i.test(sentence) ||
      /\byou(?:'|’)ll\b|\bfrom them\b/i.test(sentence)
    ) {
      continue;
    }
    if (
      restatesSchedule(sentence) ||
      repeatsPlace(sentence, placeEvent) ||
      (placeEvent !== event && repeatsPlace(sentence, event))
    ) {
      continue;
    }
    const topic = withPeriod(sentence);
    if (topic.replace(/\.+$/g, "").trim().toLowerCase() === titleKey) continue;
    if (topic.split(/\s+/).length < 3) continue;
    const combined = `${facts} ${topic}`.replace(/\s+/g, " ").trim();
    if (combined.length <= META_MAX) return combined;
  }
  return facts;
}
