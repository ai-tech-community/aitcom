import { isPublishableJobTitle } from "@/lib/investigations/startup-job-boards";
import {
  parseStartupRoleTitle,
  sanitizeStartupRoleDescription,
} from "@/lib/investigations/startup-roles";
import { presentText } from "@/lib/investigations/startups";

/** Open-role descriptions shorter than this are too thin to index. */
export const OPEN_JOB_DESCRIPTION_INDEX_MIN = 200;

/**
 * Non-whitespace characters `sanitizeStartupRoleDescription` can remove:
 * an 8-letter OCR prefix, one leading CTA ("learn more"), and one trailing
 * "read more" / "more info". Whitespace itself is not counted.
 */
export const OPEN_JOB_SANITIZE_NON_WS_REMOVAL_MAX = 8 + 9 + 8;

/**
 * Every character JavaScript treats as whitespace (`\s` and `String#trim`).
 * The sitemap's length query strips this same set inside Postgres.
 */
export const OPEN_JOB_JS_WHITESPACE =
  "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

const OPEN_JOB_JS_WHITESPACE_SET = new Set(OPEN_JOB_JS_WHITESPACE);

export function openJobNonWhitespaceCount(
  value: string | null | undefined,
): number {
  if (!value) return 0;
  let count = 0;
  for (const char of value) {
    if (!OPEN_JOB_JS_WHITESPACE_SET.has(char)) count += 1;
  }
  return count;
}

/**
 * True when the stored description can still sanitize to under 200 characters,
 * so the sitemap has to read that body. Shorter rows, and rows with enough
 * non-whitespace that sanitize cannot cross the line, are decided from lengths.
 */
export function openJobSitemapNeedsBody(input: {
  rawChars: number;
  nonWsChars: number;
}): boolean {
  const rawChars = finiteChars(input.rawChars);
  const nonWsChars = finiteChars(input.nonWsChars);
  return (
    rawChars >= OPEN_JOB_DESCRIPTION_INDEX_MIN &&
    nonWsChars <
      OPEN_JOB_DESCRIPTION_INDEX_MIN + OPEN_JOB_SANITIZE_NON_WS_REMOVAL_MAX
  );
}

/**
 * Description passed to `isNoindexOpenJob` from the sitemap.
 *
 * Outside the length band, a run of "a" sanitizes to itself and stands in for
 * the body. Inside the band, `body` is the stored text (or null when it was
 * not loaded, which keeps the role out of the sitemap).
 */
export function openJobSitemapDescription(input: {
  rawChars: number;
  nonWsChars: number;
  body?: string | null;
}): string | null {
  const rawChars = finiteChars(input.rawChars);
  if (openJobSitemapNeedsBody(input)) return input.body ?? null;
  if (rawChars <= 0) return null;
  return "a".repeat(Math.min(rawChars, OPEN_JOB_DESCRIPTION_INDEX_MIN));
}

function finiteChars(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

export type OpenJobIndexInput = {
  title: string | null | undefined;
  descriptionText: string | null | undefined;
};

/**
 * An open role is kept out of the index when its description is under 200
 * characters, or when `isPublishableJobTitle` (the #438 title filter) rejects
 * the title. Callers pass the live row. A longer description makes a
 * publishable title indexable; this is not a frozen slug list.
 */
export function isNoindexOpenJob(input: OpenJobIndexInput): boolean {
  const title =
    parseStartupRoleTitle(input.title) ?? presentText(input.title) ?? "";
  const description = sanitizeStartupRoleDescription(input.descriptionText);
  const chars = description?.length ?? 0;
  if (chars < OPEN_JOB_DESCRIPTION_INDEX_MIN) return true;
  return !isPublishableJobTitle(title);
}

export function openJobRobots(
  input: OpenJobIndexInput & {
    status: "open" | "closed" | "pending_review";
  },
): { index: boolean; follow: true } {
  if (input.status !== "open" || isNoindexOpenJob(input)) {
    return { index: false, follow: true };
  }
  return { index: true, follow: true };
}
