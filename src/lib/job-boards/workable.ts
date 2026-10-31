import { z } from "zod";
import {
  jobBoardName,
  jobHttpUrl,
  jobPublicationDate,
  optionalJobText,
  type JobBoardSourceRow,
} from "./job-board";

/** Documented public jobs endpoint; the context guards its current redirect. */
export function workableBoardUrl(name: string): string {
  return `https://www.workable.com/api/accounts/${encodeURIComponent(name)}?details=true`;
}

const SHORTCODE = "[A-Fa-f0-9]{10}";
const BOARD_PATH = new RegExp(`^/([^/]+)(?:/j/${SHORTCODE}(?:/apply)?)?/?$`);
const SERVICE_HOSTS = new Set([
  "www",
  "apply",
  "jobs",
  "help",
  "support",
  "get",
  "api",
  "go",
  "resources",
]);
const SERVICE_PATHS = new Set(["api", "j", "auth", "login", "signup"]);

/** Only addresses that identify an account; a global shortlink does not. */
export function recognizeWorkableBoard(url: URL): string | null {
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  let name: string | undefined;
  if (url.hostname === "www.workable.com") {
    name = /^\/api\/accounts\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  } else if (url.hostname === "apply.workable.com") {
    name = /^\/api\/v1\/widget\/accounts\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    if (!name) {
      name = BOARD_PATH.exec(url.pathname)?.[1];
      if (name && SERVICE_PATHS.has(name)) return null;
    }
  } else {
    const subdomain =
      /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.workable\.com$/.exec(
        url.hostname,
      )?.[1];
    if (
      subdomain &&
      !SERVICE_HOSTS.has(subdomain) &&
      /^\/(?:jobs\/\d+(?:\/candidates\/new)?\/?)?$/.test(url.pathname)
    )
      name = subdomain;
  }
  const parsed = jobBoardName.safeParse(name);
  return parsed.success ? parsed.data : null;
}

const responseSchema = z.object({
  jobs: z.array(
    z.object({
      title: z.string().trim().min(1),
      url: z.url({ protocol: /^https?$/ }),
      application_url: z.unknown().optional(),
      city: z.string().nullish(),
      state: z.string().nullish(),
      country: z.string().nullish(),
      department: z.string().nullish(),
      employment_type: z.string().nullish(),
      workplace_type: z.string().nullish(),
      telecommuting: z.boolean().nullish(),
      published_on: z.string().nullish(),
      description: z.string().nullish(),
    }),
  ),
});

/** A calendar date has no source time or timezone to invent. */
function publicationDate(value: string | null | undefined): string | null {
  const raw = optionalJobText(value);
  const timestamp = jobPublicationDate(raw);
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return timestamp?.startsWith(`${raw}T`) ? raw : null;
  }
  return timestamp;
}

function workplaceType(
  value: string | null | undefined,
  telecommuting: boolean | null | undefined,
): string | null {
  const explicit = optionalJobText(value);
  if (explicit === "on_site") return "OnSite";
  if (explicit === "hybrid") return "Hybrid";
  if (explicit === "remote") return "Remote";
  return explicit ?? (telecommuting === true ? "Remote" : null);
}

/** Public account jobs only; `state` is geography here, not listing status. */
export function parseWorkableBoard(
  payload: unknown,
): JobBoardSourceRow[] | null {
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) return null;
  return parsed.data.jobs.map((job) => {
    const location = [
      ...new Set(
        [job.city, job.state, job.country]
          .map(optionalJobText)
          .filter((part): part is string => part !== null),
      ),
    ].join(", ");
    return {
      title: job.title,
      location: location || null,
      department: optionalJobText(job.department),
      url: job.url,
      applyUrl: jobHttpUrl(job.application_url),
      employmentType: optionalJobText(job.employment_type),
      workplaceType: workplaceType(job.workplace_type, job.telecommuting),
      postedAt: publicationDate(job.published_on),
      description: null,
      descriptionTruncated: false,
      ...(job.description?.trim()
        ? { descriptionMarkup: { html: job.description, encoded: false } }
        : {}),
    };
  });
}
