/**
 * Explicit rollout switch for the community gallery. Never enable before the
 * 20261113a migration is applied and the S3 permissions for the gallery
 * prefixes are in place (spec 2026-11-13, Storage).
 */
export function galleryEnabled(): boolean {
  return process.env.COMMUNITY_GALLERY_ENABLED === "true";
}
