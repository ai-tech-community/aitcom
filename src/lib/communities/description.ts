import { z } from "zod";

/**
 * Community about text. The settings textarea, the create dialog, and every
 * save path (browser and MCP) use this same ceiling.
 *
 * The column is unlimited `text`. A previous cap of 500 characters rejected
 * or cut a paste mid-word (the stored `owner-to-owner` description ends
 * "stay f"). Reads return the stored text unchanged; this module does not
 * rewrite existing rows.
 */
export const COMMUNITY_DESCRIPTION_MAX = 2000;

export const communityDescriptionSchema = z
  .string()
  .max(COMMUNITY_DESCRIPTION_MAX);

/**
 * What `get-community-info` puts on the wire. The description is the full
 * stored value. `descriptionTruncated` is true only when this response
 * shortened it (it does not).
 */
export function presentCommunityDescription(stored: string | null): {
  description: string | null;
  descriptionTruncated: boolean;
} {
  return { description: stored, descriptionTruncated: false };
}
