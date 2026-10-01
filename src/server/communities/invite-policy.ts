import type { CommunityRole } from "./role-utils";

export type JoinPolicy = "open" | "invite_only" | "approval_required";

export type SlugJoinResult =
  | { ok: true; status: "active" | "pending_approval" }
  | { ok: false; reason: "invite_only" };

/**
 * Outcome of joining a community via its public slug link, per join policy.
 * `invite_only` is refused because a public slug is not a secret (ADR-0019).
 */
export function slugJoinStatus(joinPolicy: JoinPolicy): SlugJoinResult {
  switch (joinPolicy) {
    case "open":
      return { ok: true, status: "active" };
    case "approval_required":
      return { ok: true, status: "pending_approval" };
    case "invite_only":
      return { ok: false, reason: "invite_only" };
  }
}

/** The role an invite code grants; a null/absent role means a plain member. */
export function roleFromInvite(
  inviteRole: string | null | undefined,
): CommunityRole {
  return (inviteRole as CommunityRole | null | undefined) ?? "member";
}

/**
 * Whether a signed-in user may redeem a (possibly email-bound) invite code.
 * A null `targetEmail` means anyone may redeem; otherwise the user's email
 * must match case- and whitespace-insensitively (ADR-0019 role-bearing invite).
 */
export function canRedeemInvite(
  targetEmail: string | null | undefined,
  userEmail: string | null | undefined,
): boolean {
  if (!targetEmail) return true;
  if (!userEmail) return false;
  return targetEmail.trim().toLowerCase() === userEmail.trim().toLowerCase();
}

export type MembershipStatus =
  | "active"
  | "pending_approval"
  | "invited"
  | "banned";

/** What a visitor can do about a community, from its policy and their membership. */
export type ViewerJoinAction =
  | { kind: "join" }
  | { kind: "request" }
  | { kind: "pending" }
  | { kind: "invite_only" }
  | { kind: "member"; canLeave: boolean }
  | { kind: "unavailable" };

/**
 * The one rule every join control follows (community page, directory cards,
 * the Explore street). `status` is null for a guest or a non-member. An
 * open invitation does not skip the community's policy here: accepting an
 * invite runs through the invite link. Owners and members of the Hub root
 * cannot leave (the Hub is where every member belongs).
 */
export function viewerJoinAction({
  joinPolicy,
  status,
  role,
  isHub = false,
}: {
  joinPolicy: JoinPolicy;
  status: MembershipStatus | null;
  role?: CommunityRole | null;
  isHub?: boolean;
}): ViewerJoinAction {
  if (status === "banned") return { kind: "unavailable" };
  if (status === "active") {
    return { kind: "member", canLeave: role !== "owner" && !isHub };
  }
  if (status === "pending_approval") return { kind: "pending" };
  switch (joinPolicy) {
    case "open":
      return { kind: "join" };
    case "approval_required":
      return { kind: "request" };
    case "invite_only":
      return { kind: "invite_only" };
  }
}
