import { HUB_SLUG } from "./hub";

export const COMMUNITY_SLUG_MAX_LENGTH = 100;

/**
 * Generates a URL-friendly slug from a community name.
 */
export function generateSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric → hyphen
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}

export function isValidCommunitySlug(slug: string): boolean {
  return (
    slug.length > 0 &&
    slug.length <= COMMUNITY_SLUG_MAX_LENGTH &&
    slug === generateSlug(slug)
  );
}

export function isReservedCommunitySlug(slug: string): boolean {
  return slug === HUB_SLUG;
}
