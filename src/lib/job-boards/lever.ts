import { z } from "zod";
import {
  jobBoardName,
  jobHttpUrl,
  optionalJobText,
  type JobBoardSourceRow,
} from "./job-board";

export const LEVER_PAGE_SIZE = 100;
export type LeverBoard = "lever" | "lever-eu";

export function leverBoardUrl(
  name: string,
  board: LeverBoard = "lever",
  skip = 0,
): string {
  const host = board === "lever-eu" ? "api.eu.lever.co" : "api.lever.co";
  return `https://${host}/v0/postings/${encodeURIComponent(name)}?mode=json&limit=${LEVER_PAGE_SIZE}&skip=${skip}`;
}

const POSTING = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const HOSTED_PATH = new RegExp(`^/([^/]+)(?:/${POSTING}(?:/apply)?)?/?$`, "i");

/** Hosted board/posting/application links and list APIs only; no network I/O. */
export function recognizeLeverBoard(
  url: URL,
): { name: string; board: LeverBoard } | null {
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  const eu =
    url.hostname === "jobs.eu.lever.co" || url.hostname === "api.eu.lever.co";
  const hosted =
    url.hostname === "jobs.lever.co" || url.hostname === "jobs.eu.lever.co";
  const api =
    url.hostname === "api.lever.co" || url.hostname === "api.eu.lever.co";
  const name = hosted
    ? HOSTED_PATH.exec(url.pathname)?.[1]
    : api
      ? /^\/v0\/postings\/([^/]+)\/?$/.exec(url.pathname)?.[1]
      : undefined;
  const parsed = jobBoardName.safeParse(name);
  return parsed.success
    ? { name: parsed.data, board: eu ? "lever-eu" : "lever" }
    : null;
}

const posting = z.object({
  text: z.string().trim().min(1),
  hostedUrl: z.url({ protocol: /^https?$/ }),
  applyUrl: z.unknown().optional(),
  categories: z
    .object({
      location: z.string().nullish(),
      department: z.string().nullish(),
      team: z.string().nullish(),
      commitment: z.string().nullish(),
    })
    .nullish(),
  workplaceType: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  description: z.string().nullish(),
  lists: z
    .array(
      z.object({ text: z.string().nullish(), content: z.string().nullish() }),
    )
    .nullish(),
  additionalPlain: z.string().nullish(),
  additional: z.string().nullish(),
  salaryDescriptionPlain: z.string().nullish(),
  salaryDescription: z.string().nullish(),
});

/** Escaping is string-only; all markup parsing happens in the bounded worker. */
function escaped(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function section(
  plain: string | null | undefined,
  html: string | null | undefined,
): string {
  const text = optionalJobText(plain);
  return text ? `<div>${escaped(text)}</div>` : (optionalJobText(html) ?? "");
}

/** The public endpoint exposes only published postings, as an ungrouped array. */
export function parseLeverBoard(payload: unknown): JobBoardSourceRow[] | null {
  const parsed = z.array(posting).safeParse(payload);
  if (!parsed.success) return null;
  return parsed.data.map((job) => {
    const html = [
      section(job.descriptionPlain, job.description),
      ...(job.lists ?? []).map(
        (list) =>
          `<section>${list.text ? `<h2>${escaped(list.text)}</h2>` : ""}${list.content ?? ""}</section>`,
      ),
      section(job.salaryDescriptionPlain, job.salaryDescription),
      section(job.additionalPlain, job.additional),
    ]
      .filter(Boolean)
      .join("\n");
    const workplace = optionalJobText(job.workplaceType);
    return {
      title: job.text,
      location: optionalJobText(job.categories?.location),
      department:
        optionalJobText(job.categories?.department) ??
        optionalJobText(job.categories?.team),
      url: job.hostedUrl,
      applyUrl: jobHttpUrl(job.applyUrl),
      employmentType: optionalJobText(job.categories?.commitment),
      workplaceType:
        workplace === "remote"
          ? "Remote"
          : workplace === "hybrid"
            ? "Hybrid"
            : workplace === "on-site"
              ? "OnSite"
              : workplace === "unspecified"
                ? null
                : workplace,
      // Lever's createdAt is a creation time, not a documented publication date.
      postedAt: null,
      description: null,
      descriptionTruncated: false,
      ...(html ? { descriptionMarkup: { html, encoded: false } } : {}),
    };
  });
}
