/**
 * Ownership gate for `checkConflicts`'s `excludeEventId` (#212). Unchecked,
 * `excludeEventId` would let any authenticated member sweep ids through the
 * corpus `where` clause and infer whether a given id is a live
 * [[tentative-hold]] (its absence from an otherwise-identical result set
 * de-anonymizes it) — so it's honored only when the caller owns the event or
 * administers its community; a stranger's `excludeEventId` is silently
 * dropped (same response as if the param were omitted). Kept out of
 * `corpus.ts`, which is Payload-only by contract — this needs the
 * drizzle-backed `communityMemberships` lookup too.
 *
 * Reuses `isCommunityHackathonAdmin` (an active owner|admin predicate) rather
 * than inventing a parallel role system — see `events.ts`'s own
 * admin/moderator gates (e.g. `getPendingCommunityEvents`,
 * `updateEvent`) for the house pattern this mirrors.
 */

import { and, eq } from "drizzle-orm";
import type { Payload } from "payload";

import { communityMemberships } from "@/server/db/schema";
import { isCommunityHackathonAdmin } from "@/server/hackathon/community-admin";

export interface ExcludeEventSession {
  user: { id: string };
}

/**
 * Resolves the `excludeEventId` a `checkConflicts` caller sent to a safe
 * value for `fetchCorpus`: itself when the caller submitted the event or
 * holds an active owner/admin role in its community, `undefined` otherwise
 * — including when the id doesn't resolve to an event at all (wrapped so a
 * bad/stale id degrades to "ignored", never a thrown error).
 */
export async function resolveExcludeEventId(
  payload: Payload,
  db: typeof import("@/server/db").db,
  session: ExcludeEventSession,
  excludeEventId: number | undefined,
): Promise<number | undefined> {
  if (excludeEventId == null) return undefined;

  let event;
  try {
    event = await payload.findByID({
      collection: "events",
      id: excludeEventId,
      depth: 0,
    });
  } catch {
    return undefined;
  }
  if (!event) return undefined;

  if (event.submittedBy === session.user.id) return excludeEventId;
  if (!event.communityId) return undefined;

  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, event.communityId),
      eq(communityMemberships.userId, session.user.id),
    ),
  });

  return isCommunityHackathonAdmin(membership ?? null)
    ? excludeEventId
    : undefined;
}
