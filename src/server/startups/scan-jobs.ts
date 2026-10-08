import { and, asc, eq, inArray, sql } from "drizzle-orm";

import {
  ashbyBoardUrl,
  detectJobBoardFromHtml,
  detectJobBoardFromUrl,
  extractInertiaJobBoard,
  extractJobPostingFromHtml,
  extractListingsFromCareersHtml,
  extractRipplingBoardJobs,
  greenhouseTokenFromGhJid,
  ripplingJobsIndexUrl,
  greenhouseBoardUrl,
  isPublishableJobTitle,
  leverBoardUrl,
  mergePostingIntoListing,
  nestedJobsIndexUrl,
  parseAshbyJobs,
  parseGreenhouseJobs,
  parseLeverJobs,
  parseWorkableJobs,
  workableBoardUrl,
  workableJobShortcode,
  ycombinatorCompanyJobsUrl,
  type DetectedJobBoard,
} from "@/lib/investigations/startup-job-boards";
import {
  STARTUP_ROLES_PER_COMPANY_CAP,
  STARTUP_ROLE_FETCH_TIMEOUT_MS,
  STARTUP_ROLE_USER_AGENT,
  allocateStartupRoleSlug,
  stripPostgresRejectedChars,
  type ExtractedJobListing,
} from "@/lib/investigations/startup-roles";
import { presentText } from "@/lib/investigations/startups";
import { db } from "@/server/db";
import { startupRoles, startups } from "@/server/db/schema";
import { readBodyCapped, safeFetch } from "@/server/net/safe-fetch";
import {
  STARTUP_ROLE_VISUAL_BACKUP_CAP,
  armVisualBackup,
  ocrPostingPage,
} from "@/server/startups/posting-visual-backup";

let inVisualBatch = false;

/** Same page cap the data collectors use; board JSON fits well inside it. */
const JOB_PAGE_MAX_BYTES = 5 * 1024 * 1024;

export type JobFetchResult = {
  ok: boolean;
  status: number;
  text: string;
  contentType: string;
};

export type JobFetch = (url: string) => Promise<JobFetchResult>;

export type JobsUrlListings = {
  fetched: boolean;
  /** True when a Greenhouse, Ashby, Lever, or Workable JSON API parsed. */
  fromAtsApi: boolean;
  listings: ExtractedJobListing[];
};

export type StartupJobsScanOutcome = "applied" | "held" | "unfetched";

export type ScanStartupJobsResult = {
  startupId: string;
  fetched: number;
  published: number;
  pending: number;
  closed: number;
  outcome: StartupJobsScanOutcome;
  error?: string;
};

export type ScanAllStartupJobsResult = {
  scanned: number;
  published: number;
  pending: number;
  closed: number;
  errors: number;
  held: number;
};

/**
 * Non-ATS parse that would close at least this share of open roles is held.
 * A successful page parse that would drop all or most open roles is not written.
 */
export const STARTUP_JOBS_HOLD_CLOSE_RATIO = 0.8;

/** A non-empty parse below this many closes still closes normally. */
export const STARTUP_JOBS_HOLD_MIN_CLOSES = 5;

export function startupJobsWriteDisposition(input: {
  fetched: boolean;
  fromAtsApi: boolean;
  openCount: number;
  listingCount: number;
  wouldClose: number;
}): StartupJobsScanOutcome {
  if (!input.fetched) return "unfetched";
  if (input.fromAtsApi) return "applied";
  if (input.openCount >= 1 && input.listingCount === 0) return "held";
  if (
    input.openCount >= 1 &&
    input.wouldClose >= STARTUP_JOBS_HOLD_MIN_CLOSES &&
    input.wouldClose / input.openCount >= STARTUP_JOBS_HOLD_CLOSE_RATIO
  ) {
    return "held";
  }
  return "applied";
}

function storedRoleText(value: string | null | undefined): string | null {
  const cleaned = stripPostgresRejectedChars(value).trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** Leave headroom under the cron `maxDuration` of 300s. */
export const STARTUP_JOBS_SCAN_BUDGET_MS = 240_000;

export function startupJobsScanTablePatch(input: {
  fetched: boolean;
  published: number;
  scannedAt: Date;
}): { jobsScannedAt: Date; openRoleCount?: number } {
  if (!input.fetched) {
    return { jobsScannedAt: input.scannedAt };
  }
  return {
    jobsScannedAt: input.scannedAt,
    openRoleCount: input.published,
  };
}

/**
 * Fetch one jobs page or board API. URLs come from staff-entered careers
 * links and from the pages and board JSON they return, so every request goes
 * through safeFetch: HTTPS only, every redirect hop checked, and the
 * connection pinned to an address that passed the public-address check.
 */
export async function defaultJobFetch(url: string): Promise<JobFetchResult> {
  try {
    const { response } = await safeFetch(url, {
      userAgent: STARTUP_ROLE_USER_AGENT,
      timeoutMs: STARTUP_ROLE_FETCH_TIMEOUT_MS,
      accept: "text/html, application/json;q=0.9, */*;q=0.8",
      allowErrorStatus: true,
    });
    const body = await readBodyCapped(response, JOB_PAGE_MAX_BYTES);
    return {
      ok: response.ok,
      status: response.status,
      text: body.toString("utf8"),
      contentType: response.headers.get("content-type") ?? "",
    };
  } catch {
    return { ok: false, status: 0, text: "", contentType: "" };
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function listingsFromBoard(
  detected: DetectedJobBoard,
  fetchPage: JobFetch,
): Promise<ExtractedJobListing[] | null> {
  if (detected.board === "unknown" || !detected.token) return null;
  const url =
    detected.board === "ashby"
      ? ashbyBoardUrl(detected.token)
      : detected.board === "greenhouse"
        ? greenhouseBoardUrl(detected.token)
        : detected.board === "lever"
          ? leverBoardUrl(detected.token)
          : workableBoardUrl(detected.token);
  const page = await fetchPage(url);
  if (!page.ok) return null;
  const payload = parseJson(page.text);
  if (payload == null) return null;
  if (detected.board === "ashby") return parseAshbyJobs(payload);
  if (detected.board === "greenhouse") return parseGreenhouseJobs(payload);
  if (detected.board === "lever") return parseLeverJobs(payload);
  return parseWorkableJobs(payload);
}

async function enrichListing(
  listing: ExtractedJobListing,
  fetchPage: JobFetch,
): Promise<ExtractedJobListing | null> {
  const needsPage =
    !listing.descriptionText || !isPublishableJobTitle(listing.title);
  if (!needsPage) return listing;
  const page = await fetchPage(listing.sourceUrl);
  if (!page.ok) {
    return isPublishableJobTitle(listing.title) ? listing : null;
  }
  const merged = mergePostingIntoListing(
    listing,
    extractJobPostingFromHtml(page.text, listing.sourceUrl),
  );
  if (!isPublishableJobTitle(merged.title)) return null;
  if (merged.descriptionText) return merged;
  const visual = await ocrPostingPage(listing.sourceUrl);
  return visual ? { ...merged, descriptionText: visual } : merged;
}

async function enrichListings(
  listings: ExtractedJobListing[],
  fetchPage: JobFetch,
): Promise<ExtractedJobListing[]> {
  const capped = listings.slice(0, STARTUP_ROLES_PER_COMPANY_CAP);
  const enriched = await Promise.all(
    capped.map((listing) => enrichListing(listing, fetchPage)),
  );
  return enriched.filter((listing): listing is ExtractedJobListing =>
    Boolean(listing),
  );
}

export async function readJobsUrlListings(
  jobsUrl: string,
  fetchPage: JobFetch = defaultJobFetch,
): Promise<JobsUrlListings> {
  const ready = (
    listings: ExtractedJobListing[],
    fromAtsApi: boolean,
  ): JobsUrlListings => ({
    fetched: true,
    fromAtsApi,
    listings,
  });

  const fromUrl = detectJobBoardFromUrl(jobsUrl);
  const viaApi = await listingsFromBoard(fromUrl, fetchPage);
  if (viaApi) {
    return ready(await enrichListings(viaApi, fetchPage), true);
  }

  const page = await fetchPage(jobsUrl);
  if (!page.ok) return { fetched: false, fromAtsApi: false, listings: [] };

  const inertia = extractInertiaJobBoard(page.text, jobsUrl);
  if (inertia) {
    return ready(await enrichListings(inertia, fetchPage), false);
  }

  const fromHtml = detectJobBoardFromHtml(page.text);
  if (fromHtml.board !== "unknown") {
    const nested = await listingsFromBoard(fromHtml, fetchPage);
    if (nested) {
      return ready(await enrichListings(nested, fetchPage), true);
    }
  }

  const greenhouseToken = greenhouseTokenFromGhJid(page.text, jobsUrl);
  if (greenhouseToken) {
    const greenhouse = await listingsFromBoard(
      { board: "greenhouse", token: greenhouseToken },
      fetchPage,
    );
    if (greenhouse && greenhouse.length > 0) {
      return ready(await enrichListings(greenhouse, fetchPage), true);
    }
  }

  const indexUrl = nestedJobsIndexUrl(page.text, jobsUrl);
  if (indexUrl) {
    const nestedPage = await fetchPage(indexUrl);
    if (nestedPage.ok) {
      const nestedBoard = detectJobBoardFromHtml(nestedPage.text);
      if (nestedBoard.board !== "unknown") {
        const nested = await listingsFromBoard(nestedBoard, fetchPage);
        if (nested) {
          return ready(await enrichListings(nested, fetchPage), true);
        }
      }
      const extractedNested = extractListingsFromCareersHtml(
        nestedPage.text,
        indexUrl,
      );
      if (extractedNested.length > 0) {
        return ready(await enrichListings(extractedNested, fetchPage), false);
      }
    }
  }

  const ycBoardUrl = ycombinatorCompanyJobsUrl(page.text, jobsUrl);
  if (ycBoardUrl) {
    const ycPage =
      ycBoardUrl.replace(/\/$/, "") === jobsUrl.replace(/\/$/, "")
        ? page
        : await fetchPage(ycBoardUrl);
    if (ycPage.ok) {
      const ycJobs = extractInertiaJobBoard(ycPage.text, ycBoardUrl);
      if (ycJobs) {
        return ready(await enrichListings(ycJobs, fetchPage), false);
      }
    }
  }

  const ripplingUrl = ripplingJobsIndexUrl(page.text);
  if (ripplingUrl) {
    const boardPage =
      ripplingUrl === jobsUrl ? page : await fetchPage(ripplingUrl);
    if (boardPage.ok) {
      const rippling = extractRipplingBoardJobs(boardPage.text, ripplingUrl);
      if (rippling) {
        return ready(await enrichListings(rippling, fetchPage), false);
      }
    }
  }

  const extracted = extractListingsFromCareersHtml(page.text, jobsUrl);
  return ready(await enrichListings(extracted, fetchPage), false);
}

export async function listingsFromJobsUrl(
  jobsUrl: string,
  fetchPage: JobFetch = defaultJobFetch,
): Promise<ExtractedJobListing[]> {
  return (await readJobsUrlListings(jobsUrl, fetchPage)).listings;
}

export async function scanStartupJobs(
  startup: typeof startups.$inferSelect,
  fetchPage: JobFetch = defaultJobFetch,
): Promise<ScanStartupJobsResult> {
  const jobsUrl = presentText(startup.jobsUrl);
  const empty: ScanStartupJobsResult = {
    startupId: startup.id,
    fetched: 0,
    published: 0,
    pending: 0,
    closed: 0,
    outcome: "applied",
  };
  if (!inVisualBatch) armVisualBackup(4);
  if (!jobsUrl) {
    await db
      .update(startups)
      .set(
        startupJobsScanTablePatch({
          fetched: true,
          published: 0,
          scannedAt: new Date(),
        }),
      )
      .where(eq(startups.id, startup.id));
    return empty;
  }

  let fetched = false;
  let fromAtsApi = false;
  let listings: ExtractedJobListing[] = [];
  try {
    const result = await readJobsUrlListings(jobsUrl, fetchPage);
    fetched = result.fetched;
    fromAtsApi = result.fromAtsApi;
    listings = result.listings;
  } catch (error) {
    await db
      .update(startups)
      .set(
        startupJobsScanTablePatch({
          fetched: false,
          published: 0,
          scannedAt: new Date(),
        }),
      )
      .where(eq(startups.id, startup.id));
    return { ...empty, outcome: "unfetched", error: String(error) };
  }

  if (!fetched) {
    await db
      .update(startups)
      .set(
        startupJobsScanTablePatch({
          fetched: false,
          published: 0,
          scannedAt: new Date(),
        }),
      )
      .where(eq(startups.id, startup.id));
    return {
      ...empty,
      outcome: "unfetched",
      error: "careers page unreachable",
    };
  }

  const existing = await db
    .select()
    .from(startupRoles)
    .where(eq(startupRoles.startupId, startup.id));
  const bySource = new Map(existing.map((row) => [row.sourceUrl, row]));
  const workableKey = (url: string): string | null => {
    const code = workableJobShortcode(url);
    return code ? code.toUpperCase() : null;
  };
  const byWorkable = new Map<string, (typeof existing)[number]>();
  for (const row of existing) {
    const key = workableKey(row.sourceUrl);
    if (key && !byWorkable.has(key)) byWorkable.set(key, row);
  }
  const takenSlugs = existing.map((row) => row.slug);
  const seenSources = new Set(listings.map((listing) => listing.sourceUrl));
  for (const listing of listings) {
    const key = workableKey(listing.sourceUrl);
    if (!key) continue;
    for (const row of existing) {
      if (workableKey(row.sourceUrl) === key) seenSources.add(row.sourceUrl);
    }
  }
  const openCount = existing.filter((row) => row.status === "open").length;
  const wouldClose = existing.filter(
    (row) => row.status === "open" && !seenSources.has(row.sourceUrl),
  ).length;
  if (
    startupJobsWriteDisposition({
      fetched,
      fromAtsApi,
      openCount,
      listingCount: listings.length,
      wouldClose,
    }) === "held"
  ) {
    console.info("[startup-jobs-scan] held", {
      startupId: startup.id,
      slug: startup.slug,
      openCount,
      listings: listings.length,
      wouldClose,
    });
    return {
      startupId: startup.id,
      fetched: listings.length,
      published: 0,
      pending: 0,
      closed: 0,
      outcome: "held",
    };
  }

  const fetchedAt = new Date();
  let published = 0;
  let pending = 0;

  const consumedWorkable = new Set<string>();
  for (const listing of listings) {
    const key = workableKey(listing.sourceUrl);
    const current =
      bySource.get(listing.sourceUrl) ??
      (key ? byWorkable.get(key) : undefined);
    if (key && !current && consumedWorkable.has(key)) continue;
    if (key) consumedWorkable.add(key);
    const title = storedRoleText(listing.title);
    if (!title) continue;
    const location = storedRoleText(listing.location);
    const descriptionText = storedRoleText(listing.descriptionText);
    const status = title ? "open" : "pending_review";
    if (status === "open") published += 1;
    else pending += 1;
    if (current) {
      await db
        .update(startupRoles)
        .set({
          title,
          location,
          workType: listing.workType,
          applyUrl: listing.applyUrl,
          descriptionText: descriptionText ?? current.descriptionText,
          sourceUrl: listing.sourceUrl,
          fetchedAt,
          postedAt: listing.postedAt
            ? new Date(`${listing.postedAt}T00:00:00.000Z`)
            : current.postedAt,
          board: listing.board,
          externalId: listing.externalId ?? current.externalId,
          status,
        })
        .where(eq(startupRoles.id, current.id));
      continue;
    }
    const slug = allocateStartupRoleSlug(startup.slug, title, takenSlugs);
    takenSlugs.push(slug);
    await db.insert(startupRoles).values({
      startupId: startup.id,
      slug,
      title,
      location,
      workType: listing.workType,
      sourceUrl: listing.sourceUrl,
      applyUrl: listing.applyUrl,
      descriptionText,
      fetchedAt,
      postedAt: listing.postedAt
        ? new Date(`${listing.postedAt}T00:00:00.000Z`)
        : null,
      board: listing.board,
      externalId: listing.externalId,
      status,
    });
  }

  let closed = 0;
  if (fetched) {
    const staleIds = existing
      .filter((row) => row.status === "open" && !seenSources.has(row.sourceUrl))
      .map((row) => row.id);
    if (staleIds.length > 0) {
      await db
        .update(startupRoles)
        .set({ status: "closed", fetchedAt })
        .where(inArray(startupRoles.id, staleIds));
    }
    closed = staleIds.length;
  }

  await db
    .update(startups)
    .set(
      startupJobsScanTablePatch({
        fetched,
        published,
        scannedAt: fetchedAt,
      }),
    )
    .where(eq(startups.id, startup.id));

  return {
    startupId: startup.id,
    fetched: listings.length,
    published,
    pending,
    closed,
    outcome: "applied",
  };
}

export async function scanAllStartupJobs(
  fetchPage: JobFetch = defaultJobFetch,
): Promise<ScanAllStartupJobsResult> {
  const rows = await db
    .select()
    .from(startups)
    .where(and(eq(startups.status, "approved"), eq(startups.source, "staff")))
    // Postgres ASC is NULLS LAST, so the daily cron would keep re-scanning
    // already-scanned rows and never drain jobs_scanned_at IS NULL.
    .orderBy(
      sql`${startups.jobsScannedAt} ASC NULLS FIRST`,
      asc(startups.listedOn),
    );

  const targets = rows.filter((row) => presentText(row.jobsUrl));
  const started = Date.now();
  inVisualBatch = true;
  armVisualBackup(STARTUP_ROLE_VISUAL_BACKUP_CAP);

  const summary: ScanAllStartupJobsResult = {
    scanned: 0,
    published: 0,
    pending: 0,
    closed: 0,
    errors: 0,
    held: 0,
  };

  try {
    for (const startup of targets) {
      if (Date.now() - started >= STARTUP_JOBS_SCAN_BUDGET_MS) break;
      try {
        const result = await scanStartupJobs(startup, fetchPage);
        summary.scanned += 1;
        summary.published += result.published;
        summary.pending += result.pending;
        summary.closed += result.closed;
        if (result.outcome === "held") summary.held += 1;
        if (result.error) summary.errors += 1;
      } catch {
        summary.scanned += 1;
        summary.errors += 1;
        try {
          await db
            .update(startups)
            .set(
              startupJobsScanTablePatch({
                fetched: false,
                published: 0,
                scannedAt: new Date(),
              }),
            )
            .where(eq(startups.id, startup.id));
        } catch {
          // Soft-fail: the next cron can retry this company.
        }
      }
    }
  } finally {
    inVisualBatch = false;
  }

  return summary;
}
