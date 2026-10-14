/** One member, one vote. Up is +1, down is −1, and no row is no vote. */

export type StorylineVoteChoice = "up" | "down";

export function storylineVoteValue(
  vote: StorylineVoteChoice | null,
): 1 | -1 | 0 {
  if (vote === "up") return 1;
  if (vote === "down") return -1;
  return 0;
}

export function storylineVoteChoice(
  value: unknown,
): StorylineVoteChoice | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (n === 1) return "up";
  if (n === -1) return "down";
  return null;
}

/** Local score after a member changes, replaces, or clears their own vote. */
export function applyStorylineVote(
  state: { score: number; myVote: StorylineVoteChoice | null },
  next: StorylineVoteChoice | null,
): { score: number; myVote: StorylineVoteChoice | null } {
  return {
    score:
      state.score + storylineVoteValue(next) - storylineVoteValue(state.myVote),
    myVote: next,
  };
}
