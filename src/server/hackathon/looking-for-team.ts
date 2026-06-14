// "Looking for a team" decision rules (#164). During a hackathon's forming
// phase ('live': published, rosters not yet locked) a solo-enrolled
// participant can opt in to a browsable teammate-matching list; other enrolled
// participants filter it by profile skills and connect via the existing
// join-code flow — no invitation system. Db-free + deterministic so the rules
// (who may toggle, who appears, what a skill query matches) are unit-testable
// and shared verbatim by the tRPC router and the panel's client-side filter.

import type { HackathonPhase } from "./phase";

export class LookingForTeamError extends Error {}

/**
 * Gate for flipping the opt-in flag: the caller must hold a SOLO enrollment in
 * this challenge and the hackathon must be in the forming ('live') phase.
 */
export function assertCanToggleLookingForTeam(args: {
  phase: HackathonPhase;
  enrollment: { teamId: string | null } | null;
  /** Event-level registration gate; defaults to open when omitted. */
  registrationOpen?: boolean;
}): void {
  if (!args.enrollment) {
    throw new LookingForTeamError(
      "You must enroll in this hackathon before joining the looking-for-team list.",
    );
  }
  if (args.enrollment.teamId !== null) {
    throw new LookingForTeamError("You are already on a team.");
  }
  if (args.phase === "draft") {
    throw new LookingForTeamError("Team formation is not open yet.");
  }
  if (args.phase !== "live") {
    throw new LookingForTeamError("Team formation has closed.");
  }
  if (args.registrationOpen === false) {
    throw new LookingForTeamError("Registration for this hackathon has closed.");
  }
}

export interface LookingForTeamRow {
  userId: string;
  teamId: string | null;
  lookingForTeamAt: Date | null;
  isPublic: boolean;
  displayName: string;
  skills: string[];
}

export interface LookingForTeamCandidate {
  userId: string;
  displayName: string;
  skills: string[];
  lookingForTeamAt: Date;
}

/**
 * Who appears on the list: opted in (lookingForTeamAt set), still solo
 * (teamId null — a stale flag on a teamed enrollment must never surface), and
 * holding a PUBLIC member profile. Hidden profiles are excluded entirely — a
 * profile that can't be browsed would only leak the member's existence.
 * Sorted by opt-in time (earliest first) and projected down to public-profile
 * fields only.
 */
export function lookingForTeamCandidates(
  rows: LookingForTeamRow[],
  opts?: { excludeUserId?: string },
): LookingForTeamCandidate[] {
  return rows
    .filter(
      (r): r is LookingForTeamRow & { lookingForTeamAt: Date } =>
        r.lookingForTeamAt !== null &&
        r.teamId === null &&
        r.isPublic &&
        r.userId !== opts?.excludeUserId,
    )
    .sort((a, b) => a.lookingForTeamAt.getTime() - b.lookingForTeamAt.getTime())
    .map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
      skills: r.skills,
      lookingForTeamAt: r.lookingForTeamAt,
    }));
}

/**
 * Skill filter: case-insensitive substring match against any of the member's
 * profile skills; a blank query matches everyone.
 */
export function matchesSkillFilter(skills: string[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return skills.some((s) => s.toLowerCase().includes(q));
}
