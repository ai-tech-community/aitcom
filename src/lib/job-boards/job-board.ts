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
});

export type JobBoardRow = z.infer<typeof jobBoardRowSchema>;

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
