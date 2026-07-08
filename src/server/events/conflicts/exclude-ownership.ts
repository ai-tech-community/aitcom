/**
 * Ownership gate for `checkConflicts`'s `excludeEventId` (#212). Unchecked,
 * `excludeEventId` would let any authenticated member sweep ids through the
 * corpus `where` clause and infer whether a given id is a live
 * [[tentative-hold]] (its absence from an otherwise-identical result set
 * de-anonymizes it) — so it's honored only when the caller owns the event or
 * moderates its community; a stranger's `excludeEventId` is silently
 * dropped (same response as if the param were omitted). Kept out of
 * `corpus.ts`, which is Payload-only by contract — this needs the
 * drizzle-backed `communityMemberships` lookup too.
 *
 * The community-role branch admits active owner/admin/moderator — the exact
 * trio `getPendingCommunityEvents` admits to the approval queue (see
 * `events.ts`). That does not reopen the #212 oracle: its threat model was
 * callers who cannot otherwise see the draft, and all three roles already
 * see the full draft in that queue. Withholding the param from moderators
 * made every pending row tentatively clash with ITSELF for them (I-T4 /
 * #208) — and the self-match arrives anonymized (no id on the wire), so no
 * client-side filter can remove it.
 */

import { and, eq } from "drizzle-orm";
import type { Payload } from "payload";

import { communityMemberships } from "@/server/db/schema";
import type { MembershipRow } from "@/server/hackathon/community-admin";

/** Active owner/admin/moderator of the event's community — mirrors the
 * approval-queue gate in `getPendingCommunityEvents`. Kept db-free (same
 * shape as `isCommunityHackathonAdmin`) so it stays unit-testable. */
function isCommunityEventReviewer(
  membership: MembershipRow | null | undefined,
): boolean {
  if (membership?.status !== "active") return false;
  return (
    membership.role === "owner" ||
    membership.role === "admin" ||
    membership.role === "moderator"
  );
}

export interface ExcludeEventSession {
  user: { id: string };
}

/**
 * Resolves the `excludeEventId` a `checkConflicts` caller sent to a safe
 * value for `fetchCorpus`: itself when the caller submitted the event or
 * holds an active owner/admin/moderator role in its community, `undefined`
 * otherwise — including when the id doesn't resolve to an event at all
 * (wrapped so a bad/stale id degrades to "ignored", never a thrown error).
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

  return isCommunityEventReviewer(membership ?? null)
    ? excludeEventId
    : undefined;
}
