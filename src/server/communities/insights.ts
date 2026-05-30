/** Activity-event `action` strings that count as a member contributing in a
 *  community. Hub-wide-only actions (article.*) are deliberately omitted from
 *  community attribution. See CONTEXT.md → Contribution action. */
export const CONTRIBUTION_ACTIONS = [
  "feed.post_created",
  "feed.comment_created",
  "thread.create",
  "thread.reply",
  "comment.created",
  "idea.submitted",
  "idea.voted",
  "launchpad.project.published",
  "launchpad.project.voted",
  "launchpad.update.posted",
  "launchpad.comment.created",
  "event.register",
  "event.intent",
  "event.create",
  "event.submit",
  "challenge.enrolled",
  "challenge.solution_submitted",
  "challenge.completed",
] as const;

const CONTRIBUTION_SET = new Set<string>(CONTRIBUTION_ACTIONS);

export function isContribution(action: string): boolean {
  return CONTRIBUTION_SET.has(action);
}

/** A `Date` `days` before `now` (non-mutating). */
export function windowStart(now: Date, days: number): Date {
  const d = new Date(now.getTime());
  d.setDate(d.getDate() - days);
  return d;
}
