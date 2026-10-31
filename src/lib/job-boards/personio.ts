import { z } from "zod";
import { optionalJobText, type JobBoardSourceRow } from "./job-board";

export const PERSONIO_LANGUAGES = [
  "en",
  "de",
  "fr",
  "es",
  "nl",
  "it",
  "pt",
] as const;
export type PersonioLanguage = (typeof PERSONIO_LANGUAGES)[number];
export type PersonioBoard = { origin: string; language: PersonioLanguage };

/** A board or posting on exactly one supported career-site host. */
export function recognizePersonioBoard(url: URL): PersonioBoard | null {
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.jobs\.personio\.(?:de|com)$/.test(
      url.hostname,
    )
  )
    return null;
  if (!/^\/(?:xml\/?|job\/\d{1,20}(?:\/apply)?\/?)?$/.test(url.pathname))
    return null;
  const language = url.searchParams.get("language") ?? "en";
  if (!(PERSONIO_LANGUAGES as readonly string[]).includes(language))
    return null;
  return { origin: url.origin, language: language as PersonioLanguage };
}

export function personioFeedUrl(
  board: PersonioBoard,
  language: PersonioLanguage,
): string {
  return `${board.origin}/xml?language=${language}`;
}

const text = z.string().nullish();
const office = z.union([z.string(), z.array(z.string())]).nullish();
const blank = z.string().trim().max(0);
const description = z.object({ name: text, value: text });
const position = z.object({
  id: z.string().regex(/^\d{1,20}$/),
  name: z.string().trim().min(1),
  office,
  additionalOffices: z.union([blank, z.object({ office })]).nullish(),
  department: text,
  employmentType: text,
  schedule: text,
  jobDescriptions: z
    .union([
      blank,
      z.object({
        jobDescription: z.union([description, z.array(description)]).optional(),
      }),
    ])
    .nullish(),
});

function arrayOf<T>(value: T | T[] | null | undefined): T[] {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

function escaped(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** XML is already decoded by the worker. CDATA HTML stays opaque here. */
export function parsePersonioBoard(
  payload: unknown,
  board: PersonioBoard,
  language: PersonioLanguage,
): JobBoardSourceRow[] | null {
  if (!payload || typeof payload !== "object" || !("workzag-jobs" in payload))
    return null;
  const root: unknown = payload["workzag-jobs"];
  if (typeof root === "string") return root.trim() === "" ? [] : null;
  if (!root || typeof root !== "object" || Array.isArray(root)) return null;
  if (!("position" in root)) {
    return Object.entries(root).every(
      ([key, value]) =>
        key.startsWith("@_") ||
        (key === "#text" && typeof value === "string" && !value.trim()),
    )
      ? []
      : null;
  }
  const parsed = z
    .array(position)
    .safeParse(Array.isArray(root.position) ? root.position : [root.position]);
  if (!parsed.success) return null;
  return parsed.data.map((job) => {
    const extra =
      typeof job.additionalOffices === "object"
        ? job.additionalOffices?.office
        : undefined;
    const location = [
      ...new Set(
        [...arrayOf(job.office), ...arrayOf(extra)]
          .map(optionalJobText)
          .filter((v): v is string => v !== null),
      ),
    ].join(", ");
    const descriptions =
      typeof job.jobDescriptions === "object"
        ? job.jobDescriptions?.jobDescription
        : undefined;
    const html = arrayOf(descriptions)
      .map((section) => {
        const heading = optionalJobText(section.name);
        const body = optionalJobText(section.value);
        return body
          ? `<section>${heading ? `<h2>${escaped(heading)}</h2>` : ""}${body}</section>`
          : "";
      })
      .filter(Boolean)
      .join("\n");
    const url = `${board.origin}/job/${job.id}?language=${language}`;
    return {
      title: job.name,
      location: location || null,
      department: optionalJobText(job.department),
      url,
      applyUrl: `${board.origin}/job/${job.id}/apply?language=${language}`,
      employmentType: optionalJobText(
        [job.employmentType, job.schedule]
          .map(optionalJobText)
          .filter(Boolean)
          .join(" · "),
      ),
      workplaceType: null,
      // createdAt is a creation timestamp; the feed has no publication date.
      postedAt: null,
      description: null,
      descriptionTruncated: false,
      ...(html ? { descriptionMarkup: { html, encoded: false } } : {}),
    };
  });
}
