import type { IssueVisibility } from "@/lib/magazines/values";
import {
  type CommunityVisibility,
  isContentPublic,
} from "@/server/communities/content-visibility";

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
