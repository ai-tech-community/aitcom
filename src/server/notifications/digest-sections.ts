import { isPublishableJobTitle } from "@/lib/investigations/startup-job-boards";
import {
  parseStartupRoleTitle,
  sanitizeStartupRoleDescription,
} from "@/lib/investigations/startup-roles";
import { presentText } from "@/lib/investigations/startups";

import type { DigestSection } from "./prefs";

/** Same cutoff as #442: open-role descriptions under this are too thin. */
export const DIGEST_JOB_DESCRIPTION_MIN = 200;

export const DIGEST_HIGHLIGHT_LIMIT = 5;
export const DIGEST_EVENT_LIMIT = 6;
export const DIGEST_JOB_LIMIT = 5;
export const DIGEST_STARTUP_LIMIT = 5;
export const DIGEST_EVENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type HighlightCandidate = {
  communityId: string;
  title: string;
  path: string;
  kind: "thread" | "post";
  score: number;
};

export type UpcomingEventCandidate = {
  title: string;
  slug: string;
  date: string;
  endDate?: string | null;
  status: string;
};

export type DigestJobCandidate = {
  title: string;
  slug: string;
  company: string;
  status: string;
  descriptionText: string | null;
  postedAt: Date | null;
  createdAt: Date;
};

export type LaunchpadCandidate = {
  title: string;
  slug: string;
  status: string;
  voteCount: number;
  createdAt: string;
};

/**
 * An open role belongs in the digest when #442 would index it: a publishable
 * title and a sanitized description of at least 200 characters. Closed roles,
 * junk titles ("View Job"), and thinner descriptions stay out.
 */
export function isDigestIndexableOpenJob(input: {
  status: string;
  title: string | null | undefined;
  descriptionText: string | null | undefined;
}): boolean {
  if (input.status !== "open") return false;
  const title =
    parseStartupRoleTitle(input.title) ?? presentText(input.title) ?? "";
  if (!title || !isPublishableJobTitle(title)) return false;
  const description = sanitizeStartupRoleDescription(input.descriptionText);
  return (description?.length ?? 0) >= DIGEST_JOB_DESCRIPTION_MIN;
}

/** Top threads and posts in the member's communities, by replies or likes. */
export function selectCommunityHighlights(
  candidates: readonly HighlightCandidate[],
  memberCommunityIds: ReadonlySet<string>,
  limit = DIGEST_HIGHLIGHT_LIMIT,
): HighlightCandidate[] {
  return candidates
    .filter(
      (item) =>
        memberCommunityIds.has(item.communityId) &&
        item.score > 0 &&
        item.title.trim().length > 0 &&
        item.path.startsWith("/"),
    )
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function utcDayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function parseInstant(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NaN : time;
}

/** Published events that start within the next 14 days, soonest first. */
export function selectUpcomingEvents<T extends UpcomingEventCandidate>(
  events: readonly T[],
  now: Date,
  limit = DIGEST_EVENT_LIMIT,
): T[] {
  const start = utcDayStart(now).getTime();
  const horizon = start + DIGEST_EVENT_WINDOW_MS;
  return events
    .filter(
      (event) => event.status === "published" && event.slug && event.title,
    )
    .filter((event) => {
      const begins = parseInstant(event.date);
      if (Number.isNaN(begins)) return false;
      const ends = event.endDate ? parseInstant(event.endDate) : begins;
      if (Number.isNaN(ends)) return false;
      return ends >= start && begins < horizon;
    })
    .sort((a, b) => parseInstant(a.date) - parseInstant(b.date))
    .slice(0, limit);
}

/** Newest indexable open jobs. Thin descriptions and junk titles are dropped. */
export function selectDigestJobs<T extends DigestJobCandidate>(
  jobs: readonly T[],
  limit = DIGEST_JOB_LIMIT,
): T[] {
  return jobs
    .filter((job) =>
      isDigestIndexableOpenJob({
        status: job.status,
        title: job.title,
        descriptionText: job.descriptionText,
      }),
    )
    .sort((a, b) => {
      const aTime = (a.postedAt ?? a.createdAt).getTime();
      const bTime = (b.postedAt ?? b.createdAt).getTime();
      return bTime - aTime;
    })
    .slice(0, limit);
}

/** Published Launchpad projects from the last 7 days, highest vote count first. */
export function selectLaunchpadPicks<T extends LaunchpadCandidate>(
  projects: readonly T[],
  now: Date,
  limit = DIGEST_STARTUP_LIMIT,
): T[] {
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return projects
    .filter((project) => {
      if (project.status !== "published" || !project.slug || !project.title) {
        return false;
      }
      const created = parseInstant(project.createdAt);
      return !Number.isNaN(created) && created >= weekAgo;
    })
    .sort(
      (a, b) =>
        b.voteCount - a.voteCount ||
        parseInstant(b.createdAt) - parseInstant(a.createdAt),
    )
    .slice(0, limit);
}

export function sectionIsOff(
  optedOut: ReadonlySet<DigestSection> | undefined,
  section: DigestSection,
): boolean {
  return optedOut?.has(section) ?? false;
}
