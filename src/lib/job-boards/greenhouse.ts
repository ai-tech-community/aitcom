import { z } from "zod";

export const greenhouseBoardName = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/);

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
  const parsed = greenhouseBoardName.safeParse(name);
  return parsed.success ? parsed.data : null;
}

export const jobBoardRowSchema = z.object({
  title: z.string(),
  location: z.string().nullable(),
  department: z.string().nullable(),
  url: z.url({ protocol: /^https?$/ }),
  postedAt: z.string().nullable(),
});

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

function textOrNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

/** A malformed response is different from a board with no open roles. */
export function parseGreenhouseBoard(
  payload: unknown,
): z.infer<typeof jobBoardRowSchema>[] | null {
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) return null;
  return parsed.data.jobs.map((job) => {
    // The list API usually supplies only updated_at: that is not a posting date.
    const published = job.first_published
      ? Date.parse(job.first_published)
      : NaN;
    return {
      title: job.title,
      location: textOrNull(job.location?.name),
      department: textOrNull(
        job.departments
          ?.map((d) => d.name.trim())
          .filter(Boolean)
          .join(", "),
      ),
      url: job.absolute_url,
      postedAt: Number.isFinite(published)
        ? new Date(published).toISOString()
        : null,
    };
  });
}
