import { z } from "zod";

const IMAGE_URL_MAX = 1000;

/** An http(s) address an agent may store as a cover or logo. It is not fetched. */
export function isPublicImageUrl(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > IMAGE_URL_MAX ||
    value !== value.trim()
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const publicImageUrlSchema = z
  .string()
  .max(IMAGE_URL_MAX)
  .refine(isPublicImageUrl, "Use an http(s) image URL.");
