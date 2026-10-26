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
 * value. In a content-private community, `public` counts only when a
 * confirmation is recorded; an unconfirmed public issue counts as members.
 * Every surface that shows a visibility uses this (preflight F10).
 */
export function effectiveVisibility(
  issue: { visibility: IssueVisibility; publicConfirmedAt: string | null },
  community: CommunityVisibility,
): IssueVisibility {
  switch (issue.visibility) {
    case "members":
      return "members";
    case "public":
      return isContentPublic(community) || issue.publicConfirmedAt
        ? "public"
        : "members";
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
 * - `members` clears any confirmation, so going back to `public` asks again.
 * - `public` in a content-public community (the Hub or a listed community)
 *   needs no confirmation and records none.
 * - `public` in a content-private community keeps an existing confirmation;
 *   otherwise it needs `confirmUnlistedPublic`, and records who and when.
 */
export function planVisibilityChange(input: {
  next: IssueVisibility;
  current: VisibilityRecord;
  community: CommunityVisibility;
  confirmUnlistedPublic: boolean;
  actorId: string;
  now: Date;
}):
  | { ok: true; record: VisibilityRecord }
  | { ok: false; code: "CONFIRM_UNLISTED_PUBLIC" } {
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
    case "public": {
      if (isContentPublic(community)) {
        return {
          ok: true,
          record: {
            visibility: "public",
            publicConfirmedBy: null,
            publicConfirmedAt: null,
          },
        };
      }
      if (current.visibility === "public" && current.publicConfirmedAt) {
        return { ok: true, record: current };
      }
      if (!input.confirmUnlistedPublic) {
        return { ok: false, code: "CONFIRM_UNLISTED_PUBLIC" };
      }
      return {
        ok: true,
        record: {
          visibility: "public",
          publicConfirmedBy: input.actorId,
          publicConfirmedAt: input.now.toISOString(),
        },
      };
    }
  }
}
