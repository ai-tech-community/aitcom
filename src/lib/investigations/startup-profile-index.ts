import { sourcedAnswerBlurb } from "@/lib/investigations/startup-sourced-answers";
import { presentText } from "@/lib/investigations/startups";

/** Public blurb shorter than this, with no open roles, is too thin to index. */
export const THIN_STARTUP_DESCRIPTION_CHARS = 80;

export type StartupProfileIndexInput = {
  description: string | null | undefined;
  openRoleCount: number;
  /**
   * Used only when the row has no public blurb. A sourced answer of at least
   * {@link THIN_STARTUP_DESCRIPTION_CHARS} characters then stands in for it.
   */
  slug?: string;
};

/**
 * Description the 80-character rule should see.
 *
 * A stored blurb always wins, including a short one. When the row has no
 * blurb, the sourced "what it does" sentence is that description if it is
 * long enough to pass the same rule the other sourced profiles pass on
 * their stored copy.
 */
export function startupProfileIndexInput(
  input: StartupProfileIndexInput,
): StartupProfileIndexInput {
  const description = presentText(input.description);
  const openRoleCount = input.openRoleCount;
  if ((description?.length ?? 0) >= THIN_STARTUP_DESCRIPTION_CHARS) {
    return { description, openRoleCount };
  }
  if (!description && input.slug) {
    const sourced = presentText(sourcedAnswerBlurb(input.slug));
    if ((sourced?.length ?? 0) >= THIN_STARTUP_DESCRIPTION_CHARS) {
      return { description: sourced, openRoleCount };
    }
  }
  return { description: input.description, openRoleCount };
}

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
  return isThinStartupProfile(startupProfileIndexInput(input))
    ? { index: false, follow: true }
    : { index: true, follow: true };
}
