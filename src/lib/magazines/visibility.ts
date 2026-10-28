import type { IssueVisibility } from "@/lib/magazines/values";
import {
  type CommunityVisibility,
  isContentPublic,
} from "@/server/communities/content-visibility";

/**
 * The pure visibility rules of magazine issues (ADR-0042, Decisions 5 and
 * 6), in one client-safe module: the server's resolver and service and the
 * editor screens (settings, builder) all import them from here, so a
 * screen never re-derives what the server decides. `CommunityVisibility` is
 * plain data (slug and listing), never a database row.
 */

/**
 * The visibility a non-member effectively gets (ADR-0042, Decision 5). In a
 * content-public community (the Hub or a listed community) it is the stored
 * value. In a content-private community, `teaser` and `public` count only
 * when a confirmation is recorded; unconfirmed issues count as members.
 * Every surface that shows a visibility uses this (preflight F10).
 */
export function effectiveVisibility(
  issue: { visibility: IssueVisibility; publicConfirmedAt: string | null },
  community: CommunityVisibility,
): IssueVisibility {
  switch (issue.visibility) {
    case "members":
      return "members";
    case "teaser":
    case "public":
      return isContentPublic(community) || issue.publicConfirmedAt
        ? issue.visibility
        : "members";
  }
}

/** `teaser` and `public` show the community to everyone (Decision 2). */
export function opensToOutsiders(visibility: IssueVisibility): boolean {
  switch (visibility) {
    case "members":
      return false;
    case "teaser":
    case "public":
      return true;
  }
}

/**
 * A visibility value and its unlisted-community opt-in, as stored on a
 * magazine (for its default) and on an issue (for its own visibility).
 */
export type VisibilityRecord = {
  visibility: IssueVisibility;
  publicConfirmedBy: string | null;
  publicConfirmedAt: string | null;
};

/**
 * The one place that writes a visibility record (ADR-0042, Decision 6).
 *
 * - `members` clears any confirmation, so opening to outsiders asks again.
 * - `teaser` and `public` in a content-public community need no confirmation
 *   and record none.
 * - In a content-private community, narrowing or holding outsider access
 *   keeps confirmation; widening preview to public needs a leader again.
 * - `confirmUnlistedPublic` and the refusal codes cover both outsider levels.
 */
export function planVisibilityChange(input: {
  next: IssueVisibility;
  current: VisibilityRecord;
  community: CommunityVisibility;
  /** A leader confirms showing preview or public outside an unlisted community. */
  confirmUnlistedPublic: boolean;
  actorId: string;
  actorLeadsCommunity: boolean;
  now: Date;
}):
  | { ok: true; record: VisibilityRecord }
  | {
      ok: false;
      code: "CONFIRM_UNLISTED_PUBLIC" | "UNLISTED_PUBLIC_LEADERS_ONLY";
    } {
  if (input.confirmUnlistedPublic && !input.actorLeadsCommunity) {
    return { ok: false, code: "UNLISTED_PUBLIC_LEADERS_ONLY" };
  }
  const { next, current, community } = input;

  switch (next) {
    case "members":
      return {
        ok: true,
        record: {
          visibility: "members",
          publicConfirmedBy: null,
          publicConfirmedAt: null,
        },
      };
    case "teaser":
    case "public": {
      if (isContentPublic(community)) {
        return {
          ok: true,
          record: {
            visibility: next,
            publicConfirmedBy: null,
            publicConfirmedAt: null,
          },
        };
      }
      if (
        current.publicConfirmedAt &&
        (current.visibility === "public" ||
          (current.visibility === "teaser" && next === "teaser"))
      ) {
        return { ok: true, record: { ...current, visibility: next } };
      }
      if (!input.confirmUnlistedPublic) {
        return { ok: false, code: "CONFIRM_UNLISTED_PUBLIC" };
      }
      return {
        ok: true,
        record: {
          visibility: next,
          publicConfirmedBy: input.actorId,
          publicConfirmedAt: input.now.toISOString(),
        },
      };
    }
  }
}
