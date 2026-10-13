import { presentText } from "@/lib/investigations/startups";

/** Public blurb shorter than this, with no open roles, is too thin to index. */
export const THIN_STARTUP_DESCRIPTION_CHARS = 80;

export type StartupProfileIndexInput = {
  description: string | null | undefined;
  openRoleCount: number;
};

/**
 * An approved startup is thin when its public description is under 80
 * characters and it has no open roles. Callers pass the live row (request
 * or sitemap time). A later enrichment that lengthens the description, or a
 * scan that records an open role, makes the same profile indexable.
 */
export function isThinStartupProfile(input: StartupProfileIndexInput): boolean {
  const description = presentText(input.description);
  const chars = description?.length ?? 0;
  const openRoles =
    Number.isFinite(input.openRoleCount) && input.openRoleCount > 0
      ? input.openRoleCount
      : 0;
  return chars < THIN_STARTUP_DESCRIPTION_CHARS && openRoles === 0;
}

export function startupProfileRobots(input: StartupProfileIndexInput): {
  index: boolean;
  follow: true;
} {
  return isThinStartupProfile(input)
    ? { index: false, follow: true }
    : { index: true, follow: true };
}
