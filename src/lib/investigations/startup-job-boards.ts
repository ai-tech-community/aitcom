import {
  parseStartupRoleLocation,
  parseStartupRoleTitle,
  sanitizeStartupRoleDescription,
  type ExtractedJobListing,
  type StartupRoleBoard,
} from "./startup-roles";
import { presentText } from "./startups";

export type DetectedJobBoard = {
  board: Exclude<StartupRoleBoard, "html" | "unknown"> | "unknown";
  token: string | null;
};

const SKIP_TITLE =
  /^(careers|jobs|job openings|open roles|open jobs|view all|see all|learn more|apply|home|about|teams?)$/i;

const SKIP_INDEX_TITLE =
  /^(explore|view|see|browse)\s+(all\s+)?(open\s+)?(roles|jobs|openings)\b/i;

/** YC-style location/category index CTAs, not a single posting. */
const SKIP_LOCATION_INDEX_TITLE = /^(?:.+ )?jobs in .+$/i;

export function isSkippedExtractedJobTitle(title: string): boolean {
  return (
    SKIP_TITLE.test(title) ||
    SKIP_INDEX_TITLE.test(title) ||
    SKIP_LOCATION_INDEX_TITLE.test(title)
  );
}

/** Button labels such as "[View Position & Apply →]", not a role title. */
export function isApplyCtaTitle(title: string): boolean {
  const normalized = title
    .replace(/[[\]()]/g, " ")
    .replace(/[→›»>|]+/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:view position(?:\s*(?:&|and)\s*apply)?|apply(?:\s+now|\s+to(?:\s+this)?\s+(?:role|position)|\s+for\s+this\s+(?:role|position))?)$/i.test(
    normalized,
  );
}

export function isPublishableJobTitle(title: string): boolean {
  return !isSkippedExtractedJobTitle(title) && !isApplyCtaTitle(title);
}

function firstPathSegment(pathname: string): string | null {
  const token = pathname.split("/").find(Boolean) ?? "";
  return token.length > 0 ? token : null;
}

function firstCapture(value: string, pattern: RegExp): string | null {
  return pattern.exec(value)?.[1] ?? null;
}

function asUrl(value: string, base?: string): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

export function detectJobBoardFromUrl(jobsUrl: string): DetectedJobBoard {
  const url = asUrl(jobsUrl);
  if (!url) return { board: "unknown", token: null };
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "jobs.ashbyhq.com" || host === "api.ashbyhq.com") {
    return { board: "ashby", token: firstPathSegment(url.pathname) };
  }
  if (
    host === "boards.greenhouse.io" ||
    host === "job-boards.greenhouse.io" ||
    host === "boards-api.greenhouse.io"
  ) {
    const embed = url.searchParams.get("for");
    return {
      board: "greenhouse",
      token: embed ?? firstPathSegment(url.pathname),
    };
  }
  if (host === "jobs.lever.co" || host === "api.lever.co") {
    return { board: "lever", token: firstPathSegment(url.pathname) };
  }
  if (host === "apply.workable.com") {
    return { board: "workable", token: firstPathSegment(url.pathname) };
  }
  return { board: "unknown", token: null };
}

export function detectJobBoardFromHtml(html: string): DetectedJobBoard {
  const ashby = firstCapture(
    html,
    /https?:\/\/jobs\.ashbyhq\.com\/([A-Za-z0-9_-]+)/i,
  );
  if (ashby) return { board: "ashby", token: ashby };
  const greenhouse =
    firstCapture(
      html,
      /https?:\/\/(?:job-)?boards(?:-api)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([A-Za-z0-9_-]+)/i,
    ) ?? firstCapture(html, /boards\.greenhouse\.io\/([A-Za-z0-9_-]+)/i);
  if (greenhouse) return { board: "greenhouse", token: greenhouse };
  const lever = firstCapture(
    html,
    /https?:\/\/jobs\.lever\.co\/([A-Za-z0-9_-]+)/i,
  );
  if (lever) return { board: "lever", token: lever };
  const workable = firstCapture(
    html,
    /https?:\/\/apply\.workable\.com\/([A-Za-z0-9_-]+)/i,
  );
  if (workable) return { board: "workable", token: workable };
  return { board: "unknown", token: null };
}

export function greenhouseBoardUrl(token: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
}

export function ashbyBoardUrl(token: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`;
}

export function leverBoardUrl(token: string): string {
  return `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`;
}

export function workableBoardUrl(token: string): string {
  return `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}`;
}

function listing(partial: {
  title: string | null;
  sourceUrl: string | null;
  applyUrl?: string | null;
  location?: string | null;
  workType?: string | null;
  descriptionText?: string | null;
  externalId?: string | null;
  board: StartupRoleBoard;
}): ExtractedJobListing | null {
  const title = parseStartupRoleTitle(partial.title);
  const sourceUrl = presentText(partial.sourceUrl);
  if (!title || !sourceUrl || isSkippedExtractedJobTitle(title)) return null;
  const url = asUrl(sourceUrl);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
    return null;
  }
  return {
    title,
    sourceUrl: url.toString(),
    applyUrl: presentText(partial.applyUrl) ?? url.toString(),
    location: parseStartupRoleLocation(partial.location),
    workType: presentText(partial.workType),
    descriptionText: sanitizeStartupRoleDescription(partial.descriptionText),
    externalId: presentText(partial.externalId),
    board: partial.board,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asId(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return null;
}

export function parseGreenhouseJobs(payload: unknown): ExtractedJobListing[] {
  const root = asRecord(payload);
  const jobs = Array.isArray(root?.jobs) ? root.jobs : [];
  return jobs.flatMap((job) => {
    const row = asRecord(job);
    if (!row) return [];
    const location = asRecord(row.location);
    const parsed = listing({
      title: asString(row.title),
      sourceUrl: asString(row.absolute_url),
      location: asString(location?.name),
      descriptionText: htmlToPlainText(asString(row.content)),
      externalId: asId(row.id),
      board: "greenhouse",
    });
    return parsed ? [parsed] : [];
  });
}

export function parseAshbyJobs(payload: unknown): ExtractedJobListing[] {
  const root = asRecord(payload);
  const jobs = Array.isArray(root?.jobs)
    ? root.jobs
    : Array.isArray(root?.jobPostings)
      ? root.jobPostings
      : [];
  return jobs.flatMap((job) => {
    const row = asRecord(job);
    if (!row) return [];
    const parsed = listing({
      title: asString(row.title),
      sourceUrl: asString(row.jobUrl) ?? asString(row.applyUrl),
      applyUrl: asString(row.applyUrl),
      location: asString(row.locationName) ?? asString(row.location),
      workType: asString(row.employmentType),
      descriptionText:
        asString(row.descriptionPlain) ??
        htmlToPlainText(asString(row.descriptionHtml)),
      externalId: asId(row.id),
      board: "ashby",
    });
    return parsed ? [parsed] : [];
  });
}

export function parseLeverJobs(payload: unknown): ExtractedJobListing[] {
  const jobs = Array.isArray(payload) ? payload : [];
  return jobs.flatMap((job) => {
    const row = asRecord(job);
    if (!row) return [];
    const categories = asRecord(row.categories);
    const parsed = listing({
      title: asString(row.text) ?? asString(row.title),
      sourceUrl: asString(row.hostedUrl) ?? asString(row.applyUrl),
      applyUrl: asString(row.applyUrl),
      location: asString(categories?.location),
      workType: asString(categories?.commitment),
      descriptionText:
        asString(row.descriptionPlain) ??
        htmlToPlainText(asString(row.description)),
      externalId: asId(row.id),
      board: "lever",
    });
    return parsed ? [parsed] : [];
  });
}

export function parseWorkableJobs(payload: unknown): ExtractedJobListing[] {
  const root = asRecord(payload);
  const jobs = Array.isArray(root?.jobs) ? root.jobs : [];
  return jobs.flatMap((job) => {
    const row = asRecord(job);
    if (!row) return [];
    const location = asRecord(row.location);
    const parsed = listing({
      title: asString(row.title),
      sourceUrl: asString(row.url) ?? asString(row.application_url),
      applyUrl: asString(row.application_url),
      location: asString(location?.city) ?? asString(row.location),
      descriptionText: htmlToPlainText(asString(row.description)),
      externalId: asString(row.shortcode) ?? asId(row.id),
      board: "workable",
    });
    return parsed ? [parsed] : [];
  });
}

export function htmlToPlainText(
  html: string | null | undefined,
): string | null {
  if (!html) return null;
  const strip = (value: string) =>
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<li>/gi, "\n• ")
      .replace(/<[^>]+>/g, " ");
  const decode = (value: string) =>
    value
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/gi, "'");
  const text = decode(strip(decode(html)))
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .trim();
  return presentText(text);
}

function extractJsonLdNodes(html: string): unknown[] {
  const nodes: unknown[] = [];
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    const raw = block[1]?.trim();
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) nodes.push(...parsed);
      else nodes.push(parsed);
    } catch {
      // Sourced JSON-LD only — skip broken blocks.
    }
  }
  return nodes;
}

function flattenJsonLd(node: unknown): Record<string, unknown>[] {
  const record = asRecord(node);
  if (!record) return [];
  const graph = record["@graph"];
  if (Array.isArray(graph)) {
    return graph.flatMap((item) => flattenJsonLd(item));
  }
  return [record];
}

function jsonLdType(record: Record<string, unknown>): string {
  const type = record["@type"];
  if (typeof type === "string") return type;
  if (Array.isArray(type) && typeof type[0] === "string") return type[0];
  return "";
}

export function extractJobsFromJsonLd(
  html: string,
  baseUrl: string,
): ExtractedJobListing[] {
  const listings: ExtractedJobListing[] = [];
  for (const node of extractJsonLdNodes(html).flatMap(flattenJsonLd)) {
    if (jsonLdType(node) !== "JobPosting") continue;
    const org = asRecord(node.hiringOrganization);
    const identifier = asRecord(node.identifier);
    const location = asRecord(node.jobLocation);
    const address = asRecord(location?.address);
    const source =
      asString(node.url) ??
      asString(node.sameAs) ??
      (baseUrl.includes("/job") ? baseUrl : null);
    const parsed = listing({
      title: asString(node.title),
      sourceUrl: source ? (asUrl(source, baseUrl)?.toString() ?? null) : null,
      location:
        asString(address?.addressLocality) ??
        asString(node.jobLocationType) ??
        (org ? asString(org.address) : null),
      workType: asString(node.employmentType),
      descriptionText: htmlToPlainText(asString(node.description)),
      externalId: asString(identifier?.value) ?? asId(node.identifier),
      board: "html",
    });
    if (parsed) listings.push(parsed);
  }
  return listings;
}

const JOB_HREF =
  /(?:\/jobs?\/|\/careers\/[^"'#?\s]+|\/position\/|\/openings\/|boards\.greenhouse\.io|jobs\.ashbyhq\.com|jobs\.lever\.co|apply\.workable\.com)/i;

export function extractJobAnchors(
  html: string,
  baseUrl: string,
): ExtractedJobListing[] {
  const listings: ExtractedJobListing[] = [];
  const seen = new Set<string>();
  const anchors = html.matchAll(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  );
  for (const match of anchors) {
    const href = match[1];
    const inner = htmlToPlainText(match[2]);
    if (!href || !JOB_HREF.test(href)) continue;
    const url = asUrl(href, baseUrl);
    if (!url) continue;
    const normalized = url.toString().split("#")[0] ?? url.toString();
    if (normalized === asUrl(baseUrl)?.toString()) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const parsed = listing({
      title: inner,
      sourceUrl: normalized,
      board: "html",
    });
    if (parsed) listings.push(parsed);
  }
  return listings;
}

function preferPublishableTitle(
  value: string | null | undefined,
): string | null {
  const title = parseStartupRoleTitle(htmlToPlainText(value) ?? value);
  if (!title || !isPublishableJobTitle(title)) return null;
  return title;
}

export function extractJobPostingFromHtml(
  html: string,
  sourceUrl: string,
): Pick<
  ExtractedJobListing,
  "title" | "location" | "descriptionText" | "workType"
> | null {
  const fromLd = extractJobsFromJsonLd(html, sourceUrl)[0];
  const ogTitle =
    firstCapture(
      html,
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    ) ??
    firstCapture(
      html,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    );
  const h1 = firstCapture(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title =
    preferPublishableTitle(fromLd?.title) ??
    preferPublishableTitle(h1) ??
    preferPublishableTitle(ogTitle);
  if (!title) return null;
  return {
    title,
    location: fromLd?.location ?? null,
    descriptionText:
      fromLd?.descriptionText ??
      sanitizeStartupRoleDescription(
        htmlToPlainText(
          firstCapture(html, /<article\b[^>]*>([\s\S]*?)<\/article>/i),
        ) ??
          htmlToPlainText(
            firstCapture(
              html,
              /<(?:div|section)[^>]*(?:job-description|jobDescription|description)[^>]*>([\s\S]*?)<\/(?:div|section)>/i,
            ),
          ),
      ),
    workType: fromLd?.workType ?? null,
  };
}

export function nestedJobsIndexUrl(
  html: string,
  jobsUrl: string,
): string | null {
  const base = asUrl(jobsUrl);
  if (!base) return null;
  const basePath = base.pathname.replace(/\/$/, "") || "/";
  const anchors = html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi);
  for (const match of anchors) {
    const href = match[1];
    if (!href) continue;
    const url = asUrl(href, jobsUrl);
    if (url?.origin !== base.origin) continue;
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (path === basePath) continue;
    if (/\/(?:careers\/)?jobs$/i.test(path)) {
      return `${url.origin}${url.pathname}`;
    }
  }
  return null;
}

function unescapeBoardJson(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function unescapeJsonString(value: string): string {
  try {
    const parsed: unknown = JSON.parse(`"${value}"`);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}

/**
 * YC / Work at a Startup pages embed the real role next to a relative `/jobs/{id}`
 * URL. Anchor text on those cards is often only an apply button.
 */
export function extractEmbeddedBoardJobs(
  html: string,
  baseUrl: string,
): ExtractedJobListing[] {
  const decoded = unescapeBoardJson(html);
  const listings: ExtractedJobListing[] = [];
  const matches = decoded.matchAll(
    /"title":"((?:\\.|[^"\\])*)","url":"([^"]+)"/g,
  );
  for (const match of matches) {
    const title = unescapeJsonString(match[1] ?? "");
    const href = unescapeJsonString(match[2] ?? "");
    const url = asUrl(href, baseUrl);
    if (!url || !/\/jobs\/[^/]+/i.test(url.pathname)) continue;
    const window = decoded.slice(match.index ?? 0, (match.index ?? 0) + 700);
    const location = firstCapture(window, /"location":"((?:\\.|[^"\\])*)"/);
    const workType = firstCapture(window, /"type":"((?:\\.|[^"\\])*)"/);
    const parsed = listing({
      title,
      sourceUrl: url.toString(),
      location: location ? unescapeJsonString(location) : null,
      workType: workType ? unescapeJsonString(workType) : null,
      board: "html",
    });
    if (parsed) listings.push(parsed);
  }
  return listings;
}

export function mergePostingIntoListing(
  listing: ExtractedJobListing,
  posting: Pick<
    ExtractedJobListing,
    "title" | "location" | "descriptionText" | "workType"
  > | null,
): ExtractedJobListing {
  const pageTitle = presentText(posting?.title);
  const replaceTitle =
    !isPublishableJobTitle(listing.title) &&
    pageTitle != null &&
    isPublishableJobTitle(pageTitle);
  return {
    ...listing,
    title: replaceTitle && pageTitle ? pageTitle : listing.title,
    location: listing.location ?? posting?.location ?? null,
    workType: listing.workType ?? posting?.workType ?? null,
    descriptionText: posting?.descriptionText ?? listing.descriptionText,
  };
}

export function extractListingsFromCareersHtml(
  html: string,
  baseUrl: string,
): ExtractedJobListing[] {
  const fromLd = extractJobsFromJsonLd(html, baseUrl);
  if (fromLd.length > 0) return dedupeListings(fromLd);
  const embedded = extractEmbeddedBoardJobs(html, baseUrl);
  if (embedded.length > 0) return dedupeListings(embedded);
  return dedupeListings(extractJobAnchors(html, baseUrl));
}

export function dedupeListings(
  listings: readonly ExtractedJobListing[],
): ExtractedJobListing[] {
  const seen = new Set<string>();
  const out: ExtractedJobListing[] = [];
  for (const listing of listings) {
    if (seen.has(listing.sourceUrl)) continue;
    seen.add(listing.sourceUrl);
    out.push(listing);
  }
  return out;
}
