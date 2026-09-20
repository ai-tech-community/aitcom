import { and, asc, eq, inArray } from "drizzle-orm";

import {
  ashbyBoardUrl,
  detectJobBoardFromHtml,
  detectJobBoardFromUrl,
  extractJobPostingFromHtml,
  extractListingsFromCareersHtml,
  greenhouseBoardUrl,
  leverBoardUrl,
  parseAshbyJobs,
  parseGreenhouseJobs,
  parseLeverJobs,
  parseWorkableJobs,
  workableBoardUrl,
  type DetectedJobBoard,
} from "@/lib/investigations/startup-job-boards";
import {
  STARTUP_ROLES_PER_COMPANY_CAP,
  STARTUP_ROLE_ENRICH_CAP,
  STARTUP_ROLE_FETCH_TIMEOUT_MS,
  STARTUP_ROLE_USER_AGENT,
  allocateStartupRoleSlug,
  type ExtractedJobListing,
} from "@/lib/investigations/startup-roles";
import { presentText } from "@/lib/investigations/startups";
import { db } from "@/server/db";
import { startupRoles, startups } from "@/server/db/schema";

export type JobFetchResult = {
  ok: boolean;
  status: number;
  text: string;
  contentType: string;
};

export type JobFetch = (url: string) => Promise<JobFetchResult>;

export type ScanStartupJobsResult = {
  startupId: string;
  fetched: number;
  published: number;
  pending: number;
  closed: number;
  error?: string;
};

export type ScanAllStartupJobsResult = {
  scanned: number;
  published: number;
  pending: number;
  closed: number;
  errors: number;
};

const SCAN_BATCH = 25;

export async function defaultJobFetch(url: string): Promise<JobFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    STARTUP_ROLE_FETCH_TIMEOUT_MS,
  );
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/html;q=0.9, */*;q=0.8",
        "User-Agent": STARTUP_ROLE_USER_AGENT,
      },
      redirect: "follow",
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      contentType: response.headers.get("content-type") ?? "",
    };
  } catch {
    return { ok: false, status: 0, text: "", contentType: "" };
  } finally {
    clearTimeout(timer);
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
): Promise<ExtractedJobListing> {
  if (listing.descriptionText) return listing;
  const page = await fetchPage(listing.sourceUrl);
  if (!page.ok) return listing;
  const posting = extractJobPostingFromHtml(page.text, listing.sourceUrl);
  if (!posting) return listing;
  return {
    ...listing,
    title: listing.title,
    location: listing.location ?? posting.location,
    workType: listing.workType ?? posting.workType,
    descriptionText: posting.descriptionText ?? listing.descriptionText,
  };
}

export async function listingsFromJobsUrl(
  jobsUrl: string,
  fetchPage: JobFetch = defaultJobFetch,
): Promise<ExtractedJobListing[]> {
  const fromUrl = detectJobBoardFromUrl(jobsUrl);
  const viaApi = await listingsFromBoard(fromUrl, fetchPage);
  if (viaApi && viaApi.length > 0)
    return viaApi.slice(0, STARTUP_ROLES_PER_COMPANY_CAP);

  const page = await fetchPage(jobsUrl);
  if (!page.ok) return [];
  const fromHtml = detectJobBoardFromHtml(page.text);
  if (fromHtml.board !== "unknown") {
    const nested = await listingsFromBoard(fromHtml, fetchPage);
    if (nested && nested.length > 0) {
      return nested.slice(0, STARTUP_ROLES_PER_COMPANY_CAP);
    }
  }
  const extracted = extractListingsFromCareersHtml(page.text, jobsUrl).slice(
    0,
    STARTUP_ROLES_PER_COMPANY_CAP,
  );
  return Promise.all(
    extracted.map((listing, index) =>
      index < STARTUP_ROLE_ENRICH_CAP
        ? enrichListing(listing, fetchPage)
        : Promise.resolve(listing),
    ),
  );
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
  };
  if (!jobsUrl) {
    await db
      .update(startups)
      .set({ jobsScannedAt: new Date() })
      .where(eq(startups.id, startup.id));
    return empty;
  }

  let listings: ExtractedJobListing[] = [];
  try {
    listings = await listingsFromJobsUrl(jobsUrl, fetchPage);
  } catch (error) {
    await db
      .update(startups)
      .set({ jobsScannedAt: new Date() })
      .where(eq(startups.id, startup.id));
    return { ...empty, error: String(error) };
  }

  const existing = await db
    .select()
    .from(startupRoles)
    .where(eq(startupRoles.startupId, startup.id));
  const bySource = new Map(existing.map((row) => [row.sourceUrl, row]));
  const takenSlugs = existing.map((row) => row.slug);
  const seenSources = new Set<string>();
  const fetchedAt = new Date();
  let published = 0;
  let pending = 0;

  for (const listing of listings) {
    seenSources.add(listing.sourceUrl);
    const current = bySource.get(listing.sourceUrl);
    const status = listing.title ? "open" : "pending_review";
    if (status === "open") published += 1;
    else pending += 1;
    if (current) {
      await db
        .update(startupRoles)
        .set({
          title: listing.title,
          location: listing.location,
          workType: listing.workType,
          applyUrl: listing.applyUrl,
          descriptionText: listing.descriptionText ?? current.descriptionText,
          fetchedAt,
          board: listing.board,
          externalId: listing.externalId ?? current.externalId,
          status,
        })
        .where(eq(startupRoles.id, current.id));
      continue;
    }
    const slug = allocateStartupRoleSlug(
      startup.slug,
      listing.title,
      takenSlugs,
    );
    takenSlugs.push(slug);
    await db.insert(startupRoles).values({
      startupId: startup.id,
      slug,
      title: listing.title,
      location: listing.location,
      workType: listing.workType,
      sourceUrl: listing.sourceUrl,
      applyUrl: listing.applyUrl,
      descriptionText: listing.descriptionText,
      fetchedAt,
      board: listing.board,
      externalId: listing.externalId,
      status,
    });
  }

  const staleIds = existing
    .filter((row) => row.status === "open" && !seenSources.has(row.sourceUrl))
    .map((row) => row.id);
  if (staleIds.length > 0) {
    await db
      .update(startupRoles)
      .set({ status: "closed", fetchedAt })
      .where(inArray(startupRoles.id, staleIds));
  }

  await db
    .update(startups)
    .set({ jobsScannedAt: fetchedAt })
    .where(eq(startups.id, startup.id));

  return {
    startupId: startup.id,
    fetched: listings.length,
    published,
    pending,
    closed: staleIds.length,
  };
}

export async function scanAllStartupJobs(
  fetchPage: JobFetch = defaultJobFetch,
  limit = SCAN_BATCH,
): Promise<ScanAllStartupJobsResult> {
  const rows = await db
    .select()
    .from(startups)
    .where(and(eq(startups.status, "approved"), eq(startups.source, "staff")))
    .orderBy(asc(startups.jobsScannedAt), asc(startups.listedOn));

  const targets = rows
    .filter((row) => presentText(row.jobsUrl))
    .slice(0, limit);

  const summary: ScanAllStartupJobsResult = {
    scanned: 0,
    published: 0,
    pending: 0,
    closed: 0,
    errors: 0,
  };

  for (const startup of targets) {
    try {
      const result = await scanStartupJobs(startup, fetchPage);
      summary.scanned += 1;
      summary.published += result.published;
      summary.pending += result.pending;
      summary.closed += result.closed;
      if (result.error) summary.errors += 1;
    } catch {
      summary.scanned += 1;
      summary.errors += 1;
      try {
        await db
          .update(startups)
          .set({ jobsScannedAt: new Date() })
          .where(eq(startups.id, startup.id));
      } catch {
        // Soft-fail: the next cron can retry this company.
      }
    }
  }

  return summary;
}
