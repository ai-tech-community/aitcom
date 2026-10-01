/**
 * Polls on feed posts, shared by the server and the editor. The post's text
 * is the question; a poll has 2 to 4 answers and stays open for a chosen
 * number of days. Members vote once and may change or take back their vote
 * until it closes.
 */

export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 4;
/** The longest answer, so results fit on one line on a phone. */
export const MAX_POLL_OPTION_LENGTH = 80;
/** How long a poll may stay open, in days. */
export const POLL_DAYS = [1, 3, 7] as const;
export type PollDays = (typeof POLL_DAYS)[number];
export const DEFAULT_POLL_DAYS: PollDays = 3;

/** A poll as its author sets it up. */
export type PollChoice = { options: string[]; days: PollDays };

/**
 * Why a poll cannot be posted as it is, or null when it can: every answer
 * filled in, no two the same (ignoring case and spaces), 2 to 4 of them.
 */
export function pollProblem(
  options: readonly string[],
): "tooFew" | "tooMany" | "empty" | "tooLong" | "duplicate" | null {
  const answers = options.map((option) => option.trim());
  if (answers.some((answer) => answer === "")) return "empty";
  if (answers.length < MIN_POLL_OPTIONS) return "tooFew";
  if (answers.length > MAX_POLL_OPTIONS) return "tooMany";
  if (answers.some((answer) => answer.length > MAX_POLL_OPTION_LENGTH)) {
    return "tooLong";
  }
  const seen = new Set(answers.map((answer) => answer.toLocaleLowerCase()));
  return seen.size === answers.length ? null : "duplicate";
}

/** A poll as the feed shows it. */
export type FeedPollView = {
  options: { id: string; label: string; votes: number }[];
  totalVotes: number;
  closesAt: string;
  closed: boolean;
  /** The viewer's answer, if they voted. */
  myVote: string | null;
};

/** Whole percentages for the results that add up to 100 (largest remainder). */
export function pollPercentages(votes: readonly number[]): number[] {
  const total = votes.reduce((sum, count) => sum + count, 0);
  if (total === 0) return votes.map(() => 0);
  const exact = votes.map((count) => (count * 100) / total);
  const shares = exact.map(Math.floor);
  let left = 100 - shares.reduce((sum, share) => sum + share, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest);
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    shares[index]! += 1;
    left -= 1;
  }
  return shares;
}
