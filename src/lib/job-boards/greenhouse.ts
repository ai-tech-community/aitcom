import { z } from "zod";

import {
  jobBoardName,
  jobPublicationDate,
  optionalJobText,
  type JobBoardRow,
} from "./job-board";

export { jobBoardName as greenhouseBoardName } from "./job-board";

/** Public Job Board API; content=true includes each role's departments. */
export function greenhouseBoardUrl(token: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
}

/** Recognises known board paths only; never fetches or guesses from a host. */
export function recognizeGreenhouseBoard(url: URL): string | null {
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    return null;
  }
  let name: string | undefined | null;
  if (url.hostname === "boards-api.greenhouse.io") {
    name = /^\/v1\/boards\/([^/]+)\/jobs\/?$/.exec(url.pathname)?.[1];
  } else if (
    url.hostname === "boards.greenhouse.io" ||
    url.hostname === "job-boards.greenhouse.io"
  ) {
    if (/^\/embed\/job_board\/?$/.test(url.pathname)) {
      name = url.searchParams.get("for");
    } else {
      name = /^\/([^/]+)(?:\/jobs\/\d+)?\/?$/.exec(url.pathname)?.[1];
      if (name === "embed") return null;
    }
  }
  if (!name) return null;
  const parsed = jobBoardName.safeParse(name);
  return parsed.success ? parsed.data : null;
}

const responseSchema = z.object({
  jobs: z.array(
    z.object({
      title: z.string().trim().min(1),
      absolute_url: z.url({ protocol: /^https?$/ }),
      location: z.object({ name: z.string().nullish() }).nullish(),
      departments: z.array(z.object({ name: z.string() })).nullish(),
      first_published: z.string().nullish(),
    }),
  ),
});

/** A malformed response is different from a board with no open roles. */
export function parseGreenhouseBoard(payload: unknown): JobBoardRow[] | null {
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) return null;
  return parsed.data.jobs.map((job) => {
    return {
      title: job.title,
      location: optionalJobText(job.location?.name),
      department: optionalJobText(
        job.departments
          ?.map((d) => d.name.trim())
          .filter(Boolean)
          .join(", "),
      ),
      url: job.absolute_url,
      postedAt: jobPublicationDate(job.first_published),
    };
  });
}
