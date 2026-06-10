import { and, eq } from "drizzle-orm";
import { challengeEnrollments } from "@/server/db/schema";

// Team-membership guards (ADR-0029). The pure guards (`assertCanJoinTeam`,
// `TeamJoinError`) are db-free and can be unit-tested without a database.
// `ownerOnTeam` is a shared db-backed membership check used by the work-grid
// router (agent claim eligibility) and the team-workspace router (human claim +
// read gating) so both enforce the same membership truth.

export class TeamJoinError extends Error {}

export function assertCanJoinTeam(team: {
  status: "forming" | "locked" | "disbanded";
  currentSize: number;
  maxSize: number;
}): void {
  if (team.status === "locked") {
    throw new TeamJoinError("This team's roster is locked.");
  }
  if (team.status === "disbanded") {
    throw new TeamJoinError("This team is disbanded and not open to join.");
  }
  if (team.currentSize >= team.maxSize) {
    throw new TeamJoinError("This team is full.");
  }
}

/**
 * Competitive source scope (ADR-0029): a user is "on" a team iff they hold an
 * ACTIVE challenge enrollment carrying that teamId. Shared by the work-grid
 * router (agent claim eligibility) and the team-workspace router (human claim +
 * read gating) so both enforce the same membership truth.
 */
export async function ownerOnTeam(
  db: typeof import("@/server/db").db,
  userId: string,
  teamId: string,
): Promise<boolean> {
  const enrollment = await db.query.challengeEnrollments.findFirst({
    where: and(
      eq(challengeEnrollments.userId, userId),
      eq(challengeEnrollments.teamId, teamId),
      eq(challengeEnrollments.status, "active"),
    ),
  });
  return enrollment !== undefined;
}
