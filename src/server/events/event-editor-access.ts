import { and, eq, isNull } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";

export type EditorMode = "create" | "edit" | "resubmit";

/**
 * Which editor mode, if any, a viewer gets for an existing event — the same
 * rule `events.getEventForEdit` and the update mutations enforce:
 * - a community admin/owner edits;
 * - the submitter resubmits their own rejected submission (an admin who is
 *   also the submitter resubmits when they asked to, from "My submissions");
 * - anyone else: none.
 */
export function editorModeFor(input: {
  isAdmin: boolean;
  isSubmitter: boolean;
  status: string;
  wantsResubmit: boolean;
}): Exclude<EditorMode, "create"> | null {
  const canResubmit = input.isSubmitter && input.status === "rejected";
  if (input.isAdmin)
    return input.wantsResubmit && canResubmit ? "resubmit" : "edit";
  return canResubmit ? "resubmit" : null;
}

export interface EditorAccess {
  community: { id: string; name: string; slug: string };
  mode: EditorMode;
  /** Admin/owner: creates publish directly; curation fields shown. */
  canPublish: boolean;
  event?: { id: number; title: string };
}

/**
 * Resolve the event editor page for a viewer, or null (the page answers
 * 404). Creating needs an active membership; editing follows
 * `editorModeFor`. Events are looked up inside the URL's community, so
 * another community's slug never opens here.
 */
export async function resolveEditorAccess(
  db: typeof Db,
  viewerId: string,
  communitySlug: string,
  target: { create: true } | { eventSlug: string; wantsResubmit: boolean },
): Promise<EditorAccess | null> {
  const community = await db.query.communities.findFirst({
    where: and(
      eq(communities.slug, communitySlug),
      isNull(communities.deletedAt),
    ),
    columns: { id: true, name: true, slug: true },
  });
  if (!community) return null;

  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, community.id),
      eq(communityMemberships.userId, viewerId),
    ),
    columns: { role: true, status: true },
  });
  if (membership?.status !== "active") return null;
  const isAdmin = membership.role === "owner" || membership.role === "admin";

  if ("create" in target) {
    return { community, mode: "create", canPublish: isAdmin };
  }

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: {
      slug: { equals: target.eventSlug },
      communityId: { equals: community.id },
    },
    limit: 1,
    depth: 0,
  });
  const event = docs[0];
  if (!event) return null;

  const mode = editorModeFor({
    isAdmin,
    isSubmitter: !!event.submittedBy && event.submittedBy === viewerId,
    status: event.status,
    wantsResubmit: target.wantsResubmit,
  });
  if (!mode) return null;

  return {
    community,
    mode,
    canPublish: isAdmin,
    event: { id: event.id, title: event.title },
  };
}
