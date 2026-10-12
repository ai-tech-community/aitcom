import { isPublishableJobTitle } from "@/lib/investigations/startup-job-boards";
import {
  parseStartupRoleTitle,
  sanitizeStartupRoleDescription,
} from "@/lib/investigations/startup-roles";
import { presentText } from "@/lib/investigations/startups";

/** Open-role descriptions shorter than this are too thin to index. */
export const OPEN_JOB_DESCRIPTION_INDEX_MIN = 200;

export type OpenJobIndexInput = {
  title: string | null | undefined;
  descriptionText: string | null | undefined;
};

/**
 * An open role is kept out of the index when its description is under 200
 * characters, or when `isPublishableJobTitle` (the #438 title filter) rejects
 * the title. Callers pass the live row. A longer description makes a
 * publishable title indexable; this is not a frozen slug list.
 */
export function isNoindexOpenJob(input: OpenJobIndexInput): boolean {
  const title =
    parseStartupRoleTitle(input.title) ?? presentText(input.title) ?? "";
  const description = sanitizeStartupRoleDescription(input.descriptionText);
  const chars = description?.length ?? 0;
  if (chars < OPEN_JOB_DESCRIPTION_INDEX_MIN) return true;
  return !isPublishableJobTitle(title);
}

export function openJobRobots(
  input: OpenJobIndexInput & {
    status: "open" | "closed" | "pending_review";
  },
): { index: boolean; follow: true } {
  if (input.status !== "open" || isNoindexOpenJob(input)) {
    return { index: false, follow: true };
  }
  return { index: true, follow: true };
}
