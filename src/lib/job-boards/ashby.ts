import { z } from "zod";
import { normalizeDescription } from "./description-text";

import {
  jobBoardName,
  jobHttpUrl,
  jobPublicationDate,
  optionalJobText,
  type JobBoardSourceRow,
} from "./job-board";

/** Public posting data; no API key or browser rendering is needed. */
export function ashbyBoardUrl(token: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`;
}

const UUID =
  "[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}";
const BOARD_PATH = new RegExp(`^/([^/]+)(?:/${UUID}(?:/application)?)?/?$`);

/** Only hosted board, UUID posting/application, or public API board addresses. */
export function recognizeAshbyBoard(url: URL): string | null {
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  const name =
    url.hostname === "jobs.ashbyhq.com"
      ? BOARD_PATH.exec(url.pathname)?.[1]
      : url.hostname === "api.ashbyhq.com"
        ? /^\/posting-api\/job-board\/([^/]+)\/?$/.exec(url.pathname)?.[1]
        : undefined;
  if (!name) return null;
  const parsed = jobBoardName.safeParse(name);
  return parsed.success ? parsed.data : null;
}

const envelopeSchema = z.object({ jobs: z.array(z.unknown()) });
const jobSchema = z.object({
  title: z.string().trim().min(1),
  jobUrl: z.url({ protocol: /^https?$/ }),
  location: z.string().nullish(),
  department: z.string().nullish(),
  publishedAt: z.string().nullish(),
  isListed: z.boolean().optional(),
  descriptionPlain: z.string().nullish(),
  descriptionHtml: z.string().nullish(),
  applyUrl: z.unknown(),
  employmentType: z.string().nullish(),
  workplaceType: z.string().nullish(),
});

/** Unlisted postings are direct-link-only and must not become collected rows. */
export function parseAshbyBoard(payload: unknown): JobBoardSourceRow[] | null {
  const envelope = envelopeSchema.safeParse(payload);
  if (!envelope.success) return null;
  const rows: JobBoardSourceRow[] = [];
  for (const raw of envelope.data.jobs) {
    if (
      raw &&
      typeof raw === "object" &&
      "isListed" in raw &&
      raw.isListed === false
    )
      continue;
    const parsed = jobSchema.safeParse(raw);
    if (!parsed.success) return null;
    const job = parsed.data;
    const description = normalizeDescription(job.descriptionPlain);
    rows.push({
      title: job.title,
      location: optionalJobText(job.location),
      department: optionalJobText(job.department),
      url: job.jobUrl,
      postedAt: jobPublicationDate(job.publishedAt),
      description: description.text,
      descriptionTruncated: description.truncated,
      applyUrl: jobHttpUrl(job.applyUrl),
      employmentType: optionalJobText(job.employmentType),
      workplaceType: optionalJobText(job.workplaceType),
      ...(!description.text && job.descriptionHtml?.trim()
        ? {
            descriptionMarkup: { html: job.descriptionHtml, encoded: false },
          }
        : {}),
    });
  }
  return rows;
}
