// Pure guards for joining a team (ADR-0029). A team only accepts members while
// it is "forming" and below its max size; once the roster locks at hacking-
// window open the membership is frozen so the competitive grid has a stable set
// of eligible claimers. Db-free so it can be unit-tested without a database.

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
