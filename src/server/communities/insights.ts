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

export type ActivityRow = { actorId: string; action: string; createdAt: Date };

export type HealthPulse = {
  activeNow: number;
  activePrev: number;
  newJoins: number;
  departures: number;
  contributionCount: number;
  contributionPrev: number;
};

export function summarizeHealth(opts: {
  contributions: ActivityRow[];
  joins: ActivityRow[];
  departures: ActivityRow[];
  now: Date;
  windowDays: number;
}): HealthPulse {
  const { contributions, joins, departures, now, windowDays } = opts;
  const curStart = windowStart(now, windowDays);
  const prevStart = windowStart(now, windowDays * 2);

  const inCurrent = (r: ActivityRow) => r.createdAt >= curStart;
  const inPrev = (r: ActivityRow) =>
    r.createdAt >= prevStart && r.createdAt < curStart;

  const distinct = (rows: ActivityRow[]) =>
    new Set(rows.map((r) => r.actorId)).size;

  const cur = contributions.filter(inCurrent);
  const prev = contributions.filter(inPrev);

  return {
    activeNow: distinct(cur),
    activePrev: distinct(prev),
    newJoins: joins.filter(inCurrent).length,
    departures: departures.filter(inCurrent).length,
    contributionCount: cur.length,
    contributionPrev: prev.length,
  };
}
