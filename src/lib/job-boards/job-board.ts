import { z } from "zod";

/** A hosted board's account name, never a path or a full address. */
export const jobBoardName = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/);

export const jobBoardRowSchema = z.object({
  title: z.string(),
  location: z.string().nullable(),
  department: z.string().nullable(),
  url: z.url({ protocol: /^https?$/ }),
  postedAt: z.string().nullable(),
  description: z.string().nullable(),
  applyUrl: z.url({ protocol: /^https?$/ }).nullable(),
  employmentType: z.string().nullable(),
  workplaceType: z.string().nullable(),
  descriptionTruncated: z.boolean(),
});

export type JobBoardRow = z.infer<typeof jobBoardRowSchema>;

/** Markup stays opaque until the collector hands it to its sandboxed worker. */
export type JobBoardSourceRow = JobBoardRow & {
  descriptionMarkup?: { html: string; encoded: boolean };
};

/** Optional links must be usable without embedding credentials. */
export function jobHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function optionalJobText(
  value: string | null | undefined,
): string | null {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

/** Only a source's publication field belongs here, never its update time. */
export function jobPublicationDate(
  value: string | null | undefined,
): string | null {
  const at = value ? Date.parse(value) : NaN;
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}
