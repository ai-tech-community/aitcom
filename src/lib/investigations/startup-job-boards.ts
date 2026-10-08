import {
  isStartupRoleLocationLine,
  parseStartupRoleLocation,
  parseStartupRoleTitle,
  sanitizeStartupRoleDescription,
  sourcedIsoDate,
  stripPostgresRejectedChars,
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

/**
 * Board headlines and listing-page labels, not a role.
 * DE careers pages often use these as the H1 or the button into `/careers/jobs`.
 */
const SKIP_BOARD_LABEL =
  /^(?:offene\s+stellen|offene\s+positionen|offene\s+jobs|stellenangebote?|aktuelle\s+stellen(?:angebote)?|alle\s+(?:stellen|jobs)|jobs\s+(?:&|und)\s+karriere|karriere|ab\s+sofort\s+suchen\s+wir|wir\s+suchen(?:\s+dich)?|wir\s+stellen\s+ein|jetzt\s+bewerben|open\s+positions|current\s+(?:openings|opportunities)|we(?:'|’)re\s+hiring|we\s+are\s+hiring|we(?:'|’)?re\s+(?:now\s+)?looking\s+for|we\s+are\s+(?:now\s+)?looking\s+for|join\s+our\s+team|vacatures|openstaande\s+vacatures|open\s+vacatures)[.!?]?$/i;

const SKIP_INDEX_TITLE =
  /^(?:explore|view|see|browse)\s+(?:all\s+|our\s+|job\s+)?(?:open\s+)?(?:roles|jobs|openings|positions)\b/i;

/** "View the Staff Engineer role" — the link label, not the role. */
const SKIP_VIEW_THE_ROLE = /^view the\b.+\brole$/i;

const SKIP_BARE_NUMBER = /^\d+$/;

/**
 * One-word department labels from Comeet `/co/<dept>/all` links and the
 * category heading on the same style of card (firmus, naturalint; 8 Oct 2026).
 * Real one-word roles such as Accountant stay publishable.
 */
const SKIP_DEPARTMENT_TITLE =
  /^(?:engineering|people|business|product|marketing|other)$/i;

/** YC-style location/category index CTAs, not a single posting. */
const SKIP_LOCATION_INDEX_TITLE = /^(?:.+ )?jobs in .+$/i;

const SKIP_URL_TITLE = /^https?:\/\//i;

const SKIP_OPEN_ROLES_CTA = /^(?:check out|view)\b.*\bopen roles\b/i;

const SKIP_GARBAGE_TITLE = /-->|^[^A-Za-z0-9]+$/;

const SKIP_NOT_A_ROLE = /\bjoin our\b|privacy notice|^careers single cms$/i;

export function isSkippedExtractedJobTitle(title: string): boolean {
  const label = title.replace(/\s+/g, " ").trim();
  return (
    SKIP_TITLE.test(label) ||
    SKIP_BOARD_LABEL.test(label) ||
    SKIP_INDEX_TITLE.test(label) ||
    SKIP_LOCATION_INDEX_TITLE.test(label) ||
    SKIP_URL_TITLE.test(label) ||
    SKIP_OPEN_ROLES_CTA.test(label) ||
    SKIP_VIEW_THE_ROLE.test(label) ||
    SKIP_BARE_NUMBER.test(label) ||
    SKIP_DEPARTMENT_TITLE.test(label) ||
    isStartupRoleLocationLine(label) ||
    SKIP_GARBAGE_TITLE.test(label) ||
    SKIP_NOT_A_ROLE.test(label)
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
  return /^(?:view position(?:\s*(?:&|and)\s*apply)?|apply(?:\s+now|\s+to(?:\s+this)?\s+(?:role|position)|\s+for\s+this\s+(?:role|position))?|see position details|read more|more info)$/i.test(
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
    /https?:\/\/jobs\.ashbyhq\.com\/([A-Za-z0-9][A-Za-z0-9._-]*)/i,
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

/** Careers pages that link `?gh_jid=` without a Greenhouse host still use that company's board. */
export function greenhouseTokenFromGhJid(
  html: string,
  jobsUrl: string,
): string | null {
  if (!/[?&]gh_jid=\d+/i.test(html)) return null;
  const host =
    asUrl(jobsUrl)
      ?.hostname.replace(/^www\./, "")
      .toLowerCase() ?? "";
  const label = host.split(".")[0] ?? "";
  return /^[a-z0-9-]{2,}$/.test(label) ? label : null;
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

/**
 * Workable job id from either public shape:
 * `apply.workable.com/j/<id>` or `apply.workable.com/<account>/j/<id>/`.
 */
export function workableJobShortcode(value: string): string | null {
  const url = asUrl(value);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "apply.workable.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const at = parts.findIndex((part) => part.toLowerCase() === "j");
  const code = at >= 0 ? parts[at + 1] : undefined;
  if (!code || code.toLowerCase() === "apply") return null;
  return code;
}

function listing(partial: {
  title: string | null;
  sourceUrl: string | null;
  applyUrl?: string | null;
  location?: string | null;
  workType?: string | null;
  descriptionText?: string | null;
  externalId?: string | null;
  postedAt?: string | null;
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
    workType: presentWorkType(partial.workType),
    descriptionText: sanitizeStartupRoleDescription(partial.descriptionText),
    externalId: presentText(partial.externalId),
    postedAt: sourcedIsoDate(partial.postedAt),
    board: partial.board,
  };
}

/** Real ATS publish fields only. Never updated_at, createdAt, or a crawl clock. */
function atsPostedAt(row: Record<string, unknown>): string | null {
  return (
    sourcedIsoDate(asString(row.datePosted)) ??
    sourcedIsoDate(asString(row.publishedAt)) ??
    sourcedIsoDate(asString(row.published_at)) ??
    sourcedIsoDate(asString(row.published_on)) ??
    sourcedIsoDate(asString(row.first_published)) ??
    sourcedIsoDate(asString(row.firstPublishedAt))
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Numeric character references Postgres UTF-8 text cannot store. */
function postgresCodePoint(codePoint: number): string {
  if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
    return "";
  }
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return "";
  return String.fromCodePoint(codePoint);
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
      postedAt: atsPostedAt(row),
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
      postedAt: atsPostedAt(row),
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
      postedAt: atsPostedAt(row),
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
      postedAt: atsPostedAt(row),
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
      .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, " ");
  const decode = (value: string) =>
    value
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&ndash;|&#8211;/g, "–")
      .replace(/&mdash;|&#8212;/g, "—")
      .replace(/&rsquo;|&#8217;/g, "’")
      .replace(/&lsquo;|&#8216;/g, "‘")
      .replace(/&rdquo;|&#8221;/g, "”")
      .replace(/&ldquo;|&#8220;/g, "“")
      .replace(/&hellip;|&#8230;/g, "…")
      .replace(/&#39;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
        postgresCodePoint(Number.parseInt(hex, 16)),
      )
      .replace(/&#(\d+);/g, (_, dec: string) => postgresCodePoint(Number(dec)))
      .replace(/&#x27;/gi, "'");
  const text = decode(strip(decode(html)))
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .trim();
  return presentText(stripPostgresRejectedChars(text));
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
      postedAt: atsPostedAt(node),
      board: "html",
    });
    if (parsed) listings.push(parsed);
  }
  return listings;
}

const JOB_HREF =
  /(?:\/jobs?\/|\/careers\/[^"'#?\s]+|\/position\/|\/openings\/|boards\.greenhouse\.io|jobs\.ashbyhq\.com|jobs\.lever\.co|apply\.workable\.com|recruitee\.com\/o\/[^/"'#?\s]+)/i;

function isDirectoryJobPath(pathname: string): boolean {
  return /\/jobs\/(?:location|role|industry)(?:\/|$)/i.test(pathname);
}

/**
 * A careers index (`/jobs`, `/careers/jobs`, `/en/karriere`), not one posting.
 * Optional two-letter prefix covers localized DE/EN board URLs.
 */
function isJobsIndexPath(pathname: string): boolean {
  const path = (pathname.replace(/\/+$/, "") || "/").toLowerCase();
  return (
    /^\/(?:[a-z]{2}\/)?(?:jobs?|careers|openings|positions|open-positions|karriere|stellen(?:angebote)?|vacancies|vacatures)$/.test(
      path,
    ) ||
    /^\/(?:[a-z]{2}\/)?(?:careers|karriere)\/(?:jobs?|openings|positions|open-positions|stellen(?:angebote)?)$/.test(
      path,
    )
  );
}

/** Comeet department index (`/co/engineering/all`), not one position. */
function isComeetDepartmentIndex(pathname: string): boolean {
  return /\/co\/[^/]+\/all\/?$/i.test(pathname);
}

function isNonPostingPath(pathname: string): boolean {
  return (
    isDirectoryJobPath(pathname) ||
    isJobsIndexPath(pathname) ||
    isComeetDepartmentIndex(pathname)
  );
}

/** True when the URL is a careers index, not one job card. */
export function isJobsIndexUrl(value: string | null | undefined): boolean {
  const url = asUrl(value ?? "");
  if (!url) return false;
  return isJobsIndexPath(url.pathname);
}

function classAttr(attrs: string): string {
  return /class=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
}

function headingsIn(
  innerHtml: string,
): Array<{ className: string; text: string }> {
  const found: Array<{ className: string; text: string }> = [];
  const pattern = /<h([1-4])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  for (const match of innerHtml.matchAll(pattern)) {
    const text = htmlToPlainText(match[3]);
    if (!text) continue;
    found.push({ className: classAttr(match[2] ?? ""), text });
  }
  return found;
}

function paragraphTexts(innerHtml: string): string[] {
  return [...innerHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => htmlToPlainText(match[1]))
    .filter((text): text is string => Boolean(text));
}

function asCardLocation(
  value: string | null,
  title: string | null,
): string | null {
  if (
    !value ||
    value.length > 80 ||
    value === title ||
    isApplyCtaTitle(value)
  ) {
    return null;
  }
  if (isStartupRoleLocationLine(value)) return value;
  if (isSkippedExtractedJobTitle(value)) return null;
  return value;
}

/** Card heading when the anchor wraps title + location + department. */
function anchorRoleFields(innerHtml: string): {
  title: string | null;
  location: string | null;
} {
  const headings = headingsIn(innerHtml);
  if (headings.length > 0) {
    const titled = headings.find((heading) =>
      /(?:^|\s)(?:item-title|job-title)(?:\s|$)/i.test(heading.className),
    );
    const publishable = headings.find((heading) =>
      isPublishableJobTitle(heading.text),
    );
    const title = (titled ?? publishable ?? headings[0])?.text ?? null;
    const location = asCardLocation(
      paragraphTexts(innerHtml)[0] ?? null,
      title,
    );
    return { title, location };
  }

  const paragraphs = paragraphTexts(innerHtml);
  if (paragraphs.length > 0) {
    const place =
      paragraphs.find((text) => isStartupRoleLocationLine(text)) ?? null;
    const title =
      paragraphs.find(
        (text) => text !== place && isPublishableJobTitle(text),
      ) ??
      paragraphs.find((text) => text !== place) ??
      paragraphs[0] ??
      null;
    return { title, location: place };
  }

  return { title: htmlToPlainText(innerHtml), location: null };
}

/** Company slug from a YC or Work at a Startup company board URL. */
function companySlugFromBoardUrl(baseUrl: string): string | null {
  const url = asUrl(baseUrl);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "ycombinator.com" && host !== "workatastartup.com") return null;
  return /\/companies\/([^/]+)/i.exec(url.pathname)?.[1]?.toLowerCase() ?? null;
}

/** Company jobs board linked from a careers page, not the YC directory. */
export function ycombinatorCompanyJobsUrl(
  html: string,
  baseUrl: string,
): string | null {
  const anchors = html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi);
  for (const match of anchors) {
    const href = match[1];
    if (!href) continue;
    const url = asUrl(href, baseUrl);
    if (!url) continue;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "ycombinator.com" && host !== "workatastartup.com") continue;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (/^\/companies\/[^/]+\/jobs$/i.test(path)) {
      return `${url.origin}${path}`;
    }
  }
  return null;
}

function jobBelongsToCompany(jobUrl: URL, companySlug: string | null): boolean {
  if (!companySlug) return true;
  const path = jobUrl.pathname.toLowerCase();
  if (!path.includes("/companies/")) return true;
  return path.includes(`/companies/${companySlug}/jobs/`);
}

function parseDataPage(html: string): Record<string, unknown> | null {
  const raw = firstCapture(html, /data-page="([^"]*)"/i);
  if (!raw) return null;
  try {
    return asRecord(JSON.parse(unescapeBoardJson(raw)));
  } catch {
    return null;
  }
}

function parseNextData(html: string): Record<string, unknown> | null {
  const raw = firstCapture(
    html,
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!raw) return null;
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * YC company pages embed `jobPostings`. An empty list is a live empty board.
 * Returns null when this page is not that board.
 */
export function extractInertiaJobBoard(
  html: string,
  baseUrl: string,
): ExtractedJobListing[] | null {
  const props = asRecord(parseDataPage(html)?.props);
  if (!props || !Array.isArray(props.jobPostings)) return null;
  const companySlug = companySlugFromBoardUrl(baseUrl);
  const listings: ExtractedJobListing[] = [];
  for (const item of props.jobPostings) {
    const row = asRecord(item);
    if (!row) continue;
    const url = asUrl(asString(row.url) ?? "", baseUrl);
    if (!url || isNonPostingPath(url.pathname)) continue;
    if (!jobBelongsToCompany(url, companySlug)) continue;
    const parsed = listing({
      title: asString(row.title),
      sourceUrl: url.toString(),
      location: asString(row.location),
      workType: asString(row.type),
      externalId: asId(row.id),
      postedAt: atsPostedAt(row),
      board: "html",
    });
    if (parsed) listings.push(parsed);
  }
  return dedupeListings(listings);
}

/** Rippling ATS embeds the open roles in the page payload, without a public JSON API. */
export function extractRipplingBoardJobs(
  html: string,
  baseUrl: string,
): ExtractedJobListing[] | null {
  const next = parseNextData(html);
  const pageProps = asRecord(asRecord(next?.props)?.pageProps);
  const queries = asRecord(pageProps?.dehydratedState)?.queries;
  if (!Array.isArray(queries)) return null;
  const jobsQuery = queries.find((query) => {
    const key = asRecord(query)?.queryKey;
    return Array.isArray(key) && key.includes("job-posts");
  });
  if (!jobsQuery) return null;
  const items = asRecord(asRecord(asRecord(jobsQuery)?.state)?.data)?.items;
  if (!Array.isArray(items)) return null;
  const listings: ExtractedJobListing[] = [];
  for (const item of items) {
    const row = asRecord(item);
    if (!row) continue;
    const url = asUrl(asString(row.url) ?? "", baseUrl);
    if (!url) continue;
    const locations = Array.isArray(row.locations) ? row.locations : [];
    const place = asRecord(locations[0])?.name;
    const parsed = listing({
      title: asString(row.name),
      sourceUrl: url.toString(),
      location: asString(place),
      externalId: asString(row.id),
      postedAt: atsPostedAt(row),
      board: "html",
    });
    if (parsed) listings.push(parsed);
  }
  return dedupeListings(listings);
}

export function ripplingJobsIndexUrl(html: string): string | null {
  const slug = firstCapture(
    html,
    /https?:\/\/ats\.rippling\.com\/(?:[a-z]{2}-[a-z]{2}\/)?([a-z0-9_-]+)\/jobs\b/i,
  );
  if (!slug || slug.toLowerCase() === "jobs") return null;
  return `https://ats.rippling.com/${slug}/jobs`;
}

function postingFromInertia(
  html: string,
): Pick<
  ExtractedJobListing,
  "title" | "location" | "descriptionText" | "workType"
> | null {
  const job = asRecord(asRecord(parseDataPage(html)?.props)?.job);
  if (!job) return null;
  const title = preferPublishableTitle(asString(job.title));
  if (!title) return null;
  return {
    title,
    location: asString(job.location),
    descriptionText: sanitizeStartupRoleDescription(
      htmlToPlainText(
        asString(job.descriptionHtml) ?? asString(job.description),
      ),
    ),
    workType: asString(job.type) ?? asString(job.jobType),
  };
}

function postingFromRippling(
  html: string,
): Pick<
  ExtractedJobListing,
  "title" | "location" | "descriptionText" | "workType"
> | null {
  const job = asRecord(
    asRecord(asRecord(asRecord(parseNextData(html)?.props)?.pageProps)?.apiData)
      ?.jobPost,
  );
  if (!job) return null;
  const title = preferPublishableTitle(asString(job.name));
  if (!title) return null;
  const description = asRecord(job.description);
  const descriptionText = sanitizeStartupRoleDescription(
    [
      htmlToPlainText(asString(description?.company)),
      htmlToPlainText(asString(description?.role)),
    ]
      .filter((part): part is string => Boolean(part))
      .join("\n\n"),
  );
  const locations = Array.isArray(job.workLocations)
    ? job.workLocations.filter(
        (place): place is string => typeof place === "string",
      )
    : [];
  const employment = asRecord(job.employmentType);
  return {
    title,
    location: locations.length > 0 ? locations.join(", ") : null,
    descriptionText,
    workType: asString(employment?.id),
  };
}

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
    const fields = anchorRoleFields(match[2] ?? "");
    if (!href || !JOB_HREF.test(href)) continue;
    const url = asUrl(href, baseUrl);
    if (!url || isNonPostingPath(url.pathname)) continue;
    if (!jobBelongsToCompany(url, companySlugFromBoardUrl(baseUrl))) continue;
    const normalized = url.toString().split("#")[0] ?? url.toString();
    if (samePage(normalized, baseUrl)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const parsed = listing({
      title: fields.title,
      sourceUrl: normalized,
      location: fields.location,
      board: "html",
    });
    if (parsed) listings.push(parsed);
  }
  return listings;
}

function samePage(left: string, right: string): boolean {
  const a = asUrl(left);
  const b = asUrl(right);
  if (!a || !b) return false;
  const path = (url: URL) => url.pathname.replace(/\/$/, "") || "/";
  return a.origin === b.origin && path(a) === path(b) && a.search === b.search;
}

function classNameOf(tag: string): string {
  return /class=["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
}

/** Inner HTML of divs whose opening tag matches, respecting nested divs. */
function divsMatching(
  html: string,
  matches: (openTag: string) => boolean,
): string[] {
  const blocks: string[] = [];
  const open = /<div\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = open.exec(html))) {
    const tag = match[0];
    if (!matches(tag)) continue;
    const start = match.index + tag.length;
    const tags = /<div\b[^>]*>|<\/div>/gi;
    tags.lastIndex = start;
    let depth = 1;
    let end = -1;
    let next: RegExpExecArray | null;
    while ((next = tags.exec(html))) {
      depth += next[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        end = next.index;
        break;
      }
    }
    if (end > start) blocks.push(html.slice(start, end));
    if (end > 0) open.lastIndex = end;
  }
  return blocks;
}

function divsWithClass(
  html: string,
  matches: (className: string) => boolean,
): string[] {
  return divsMatching(html, (tag) => matches(classNameOf(tag)));
}

/**
 * Webflow and similar boards put the JD in rich-text blocks, not in
 * `<article>` or a class named description.
 */
function richTextDescription(html: string): string | null {
  const rich = divsWithClass(
    html,
    (className) =>
      /(?:^|\s)(?:job-rich-text-block|job-description|posting-description)(?:\s|$)/i.test(
        className,
      ) || /job-rich-text/i.test(className),
  );
  const blocks =
    rich.length > 0
      ? rich
      : divsWithClass(html, (className) =>
          /(?:^|\s)w-richtext(?:\s|$)/i.test(className),
        );
  const text = htmlToPlainText(blocks.join("\n"));
  return text && text.length >= 80 ? text : null;
}

/** WordPress / Elementor singles keep the JD in the theme post body. */
function cmsPostDescription(html: string): string | null {
  const blocks = divsWithClass(
    html,
    (className) =>
      /theme-post-content/i.test(className) ||
      /(?:^|\s)entry-content(?:\s|$)/i.test(className),
  );
  const text = htmlToPlainText(blocks.join("\n"));
  return text && text.length >= 80 ? text : null;
}

function framerRegion(html: string, name: string): string | null {
  const blocks = divsMatching(html, (tag) =>
    new RegExp(`\\bdata-framer-name=["']${name}["']`, "i").test(tag),
  );
  return htmlToPlainText(blocks[0]);
}

function framerLabeledValue(html: string, label: string): string | null {
  const pattern = new RegExp(
    `<strong\\b[^>]*>\\s*${label}\\s*:?\\s*</strong>[\\s\\S]{0,500}?<p\\b[^>]*>([\\s\\S]*?)</p>`,
    "i",
  );
  const text = htmlToPlainText(pattern.exec(html)?.[1]);
  if (!text || text.length > 80) return null;
  return text;
}

function iconDetail(html: string, label: RegExp): string | null {
  const pattern = new RegExp(
    `alt=["'](?:${label.source})["'][^>]*>\\s*<div[^>]*position-detail__text[^>]*>([\\s\\S]*?)<\\/div>`,
    "i",
  );
  return htmlToPlainText(pattern.exec(html)?.[1]);
}

const SCHEMA_WORK_TYPE: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACTOR: "Contract",
  TEMPORARY: "Temporary",
  INTERN: "Internship",
  VOLUNTEER: "Volunteer",
  PER_DIEM: "Per diem",
};

function presentWorkType(value: string | null | undefined): string | null {
  const text = presentText(value);
  if (!text) return null;
  return SCHEMA_WORK_TYPE[text] ?? text;
}

const ROLE_SECTION =
  /^(?:about(?:\s+[a-z0-9][\w&'-]*){0,3}|the role|overview|introduction|key responsibilities|responsibilities|requirements?|qualifications?|what you(?:'|’)ll do|who we are|why join(?: us)?|perks(?:\s*&\s*benefits)?|benefits|nice[- ]to[- ]haves?|minimum qualifications?|preferred qualifications?)\s*:?$/i;

const POSTING_STOP =
  /^(?:see open positions|ready to be a part of the team\??|cookie settings|privacy policy|all rights reserved)\s*:?$/i;

const POSTING_SKIP =
  /^(?:application(?: form(?: loading)?)?\.?|open positions)\s*:?$/i;

function stripTag(html: string, tag: string): string {
  return html.replace(
    new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi"),
    " ",
  );
}

/** Drop site chrome so a menu labeled “description” is not the posting. */
function withoutChrome(html: string): string {
  let next = html;
  for (const tag of [
    "script",
    "style",
    "noscript",
    "svg",
    "header",
    "nav",
    "footer",
    "form",
  ]) {
    next = stripTag(next, tag);
  }
  return next;
}

function hasRoleSection(text: string): boolean {
  return text.split("\n").some((line) => ROLE_SECTION.test(line.trim()));
}

function isNavBlurb(text: string): boolean {
  if (hasRoleSection(text)) return false;
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3) return false;
  return lines.every(
    (line) => line.replace(/^(?:[-*•]|\d+[.)])\s+/, "").length < 70,
  );
}

/** A marked-up posting body. A short menu labeled “description” is not one. */
function containerBody(text: string | null | undefined): string | null {
  const body = presentText(text);
  if (!body || isNavBlurb(body)) return null;
  return body;
}

function asPostingBody(text: string | null | undefined): string | null {
  const body = presentText(text);
  if (!body || body.length < 80) return null;
  if (hasRoleSection(body)) return body;
  const longLine = body
    .split("\n")
    .some(
      (line) => line.replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim().length >= 80,
    );
  return longLine ? body : null;
}

/**
 * One path for pages that do not share a markup pattern: read the visible
 * text and keep the run that starts at the posting sections.
 */
function postingFromVisibleText(html: string): string | null {
  const readable = withoutChrome(html);
  const source =
    firstCapture(readable, /<main\b[^>]*>([\s\S]*?)<\/main>/i) ?? readable;
  const plain = htmlToPlainText(source);
  if (!plain) return null;
  const lines = plain
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const start = lines.findIndex(
    (line) =>
      ROLE_SECTION.test(line) ||
      line.replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim().length >= 80,
  );
  if (start < 0) return null;
  let from = start;
  const previous = lines[from - 1];
  if (
    !ROLE_SECTION.test(lines[start] ?? "") &&
    previous &&
    previous.length <= 48 &&
    !/[.!?]/.test(previous) &&
    !ROLE_SECTION.test(previous)
  ) {
    from -= 1;
  }
  const kept: string[] = [];
  for (const line of lines.slice(from)) {
    if (POSTING_STOP.test(line.replace(/^•\s*/, ""))) break;
    if (POSTING_SKIP.test(line.replace(/^•\s*/, ""))) continue;
    kept.push(line);
  }
  return asPostingBody(kept.join("\n"));
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
  "title" | "location" | "descriptionText" | "workType" | "postedAt"
> | null {
  const structured = postingFromInertia(html) ?? postingFromRippling(html);
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
    structured?.title ??
    preferPublishableTitle(fromLd?.title) ??
    preferPublishableTitle(h1) ??
    preferPublishableTitle(ogTitle);
  if (!title) return null;
  const readable = withoutChrome(html);
  const framerBody = framerRegion(html, "Content");
  const container = [
    htmlToPlainText(
      firstCapture(readable, /<article\b[^>]*>([\s\S]*?)<\/article>/i),
    ),
    htmlToPlainText(
      firstCapture(
        readable,
        /<(?:div|section)[^>]*(?:job-description|jobDescription|posting-description)[^>]*>([\s\S]*?)<\/(?:div|section)>/i,
      ),
    ),
    richTextDescription(readable),
    cmsPostDescription(readable),
    framerBody,
  ].find((text) => containerBody(text));
  return {
    title,
    location:
      structured?.location ??
      fromLd?.location ??
      iconDetail(html, /location/i) ??
      parseStartupRoleLocation(framerRegion(html, "Location")),
    descriptionText: sanitizeStartupRoleDescription(
      structured?.descriptionText ??
        fromLd?.descriptionText ??
        containerBody(container) ??
        postingFromVisibleText(html),
    ),
    workType:
      structured?.workType ??
      fromLd?.workType ??
      iconDetail(html, /availability|employment|work type/i) ??
      framerLabeledValue(html, "Job Type"),
    postedAt: fromLd?.postedAt ?? null,
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
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "ycombinator.com" || host === "workatastartup.com") continue;
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (path === basePath) continue;
    if (/\/(?:[a-z]{2}\/)?(?:careers\/)?jobs$/i.test(path)) {
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
    if (isNonPostingPath(url.pathname)) continue;
    if (!jobBelongsToCompany(url, companySlugFromBoardUrl(baseUrl))) continue;
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
  posting:
    | (Pick<
        ExtractedJobListing,
        "title" | "location" | "descriptionText" | "workType"
      > & { postedAt?: string | null })
    | null,
): ExtractedJobListing {
  const pageTitle = presentText(posting?.title);
  const listingNorm = listing.title.replace(/\s+/g, " ").trim().toLowerCase();
  const pageNorm = pageTitle?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
  const applyChrome =
    pageNorm.length > 0 &&
    listingNorm.startsWith(pageNorm) &&
    /\bapply now\b/i.test(listingNorm.slice(pageNorm.length));
  const firstLine = listing.title
    .split("\n")[0]
    ?.replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const cardChrome =
    pageNorm.length > 0 &&
    listing.title.includes("\n") &&
    firstLine === pageNorm;
  const iconChrome =
    pageNorm.length > 0 &&
    listingNorm.includes(pageNorm) &&
    listingNorm !== pageNorm &&
    /north_east|full time/.test(listingNorm);
  const replaceTitle =
    pageTitle != null &&
    isPublishableJobTitle(pageTitle) &&
    (!isPublishableJobTitle(listing.title) ||
      applyChrome ||
      cardChrome ||
      iconChrome);
  return {
    ...listing,
    title: replaceTitle && pageTitle ? pageTitle : listing.title,
    location: listing.location ?? posting?.location ?? null,
    workType: listing.workType ?? posting?.workType ?? null,
    descriptionText: posting?.descriptionText ?? listing.descriptionText,
    postedAt: listing.postedAt ?? posting?.postedAt ?? null,
  };
}

export function extractListingsFromCareersHtml(
  html: string,
  baseUrl: string,
): ExtractedJobListing[] {
  const inertia = extractInertiaJobBoard(html, baseUrl);
  if (inertia) return inertia;
  const rippling = extractRipplingBoardJobs(html, baseUrl);
  if (rippling) return rippling;
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
