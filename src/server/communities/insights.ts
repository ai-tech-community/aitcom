// ---------------------------------------------------------------------------
// Shared at-risk / unactivated constants
// Exported so routers and cron jobs share a single source of truth.
// ---------------------------------------------------------------------------

/** Rolling window for "currently active" check (days). */
export const AT_RISK_WINDOW_DAYS = 14;

/** Lookback window for "was previously active" check (days). */
export const AT_RISK_PRIOR_WINDOW_DAYS = 45;

/** Maximum at-risk members returned by selectAtRisk. */
export const AT_RISK_CAP = 50;

// ---------------------------------------------------------------------------

/** Activity-event `action` strings that count as a member contributing in a
 *  community. Hub-wide-only actions (article.*) are deliberately omitted from
 *  community attribution. See CONTEXT.md → Contribution action. */
export const CONTRIBUTION_ACTIONS = [
  "feed.post_created",
  "feed.comment_created",
  "thread.create",
  "thread.reply",
  // "comment.created" is intentionally excluded: article comments are Hub-wide
  // (no communityId), so they cannot be attributed to a community — same as article.*.
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

export type MembershipRow = {
  userId: string;
  role: string;
  status: string;
  joinedAt: Date;
};

export type AtRiskMember = {
  userId: string;
  role: string;
  priorContributions: number;
  lastContributionAt: Date | null;
};

const ROLE_RANK: Record<string, number> = {
  owner: 4,
  admin: 3,
  moderator: 2,
  member: 1,
};

export function selectAtRisk(opts: {
  memberships: MembershipRow[];
  contributions: ActivityRow[];
  now: Date;
  windowDays: number;
  priorWindowDays: number;
  cap: number;
}): AtRiskMember[] {
  const { memberships, contributions, now, windowDays, priorWindowDays, cap } =
    opts;
  const curStart = windowStart(now, windowDays);
  const priorStart = windowStart(now, priorWindowDays);

  const byUser = new Map<string, ActivityRow[]>();
  for (const c of contributions) {
    const list = byUser.get(c.actorId) ?? [];
    list.push(c);
    byUser.set(c.actorId, list);
  }

  const result: AtRiskMember[] = [];
  for (const m of memberships) {
    if (m.status !== "active") continue;
    const rows = byUser.get(m.userId) ?? [];
    const contributedRecently = rows.some((r) => r.createdAt >= curStart);
    if (contributedRecently) continue; // still active → not at risk
    const prior = rows.filter(
      (r) => r.createdAt >= priorStart && r.createdAt < curStart,
    );
    if (prior.length === 0) continue; // never engaged in prior window → newcomer, not at-risk
    const lastContributionAt = rows.reduce<Date | null>(
      (max, r) => (max === null || r.createdAt > max ? r.createdAt : max),
      null,
    );
    result.push({
      userId: m.userId,
      role: m.role,
      priorContributions: prior.length,
      lastContributionAt,
    });
  }

  result.sort(
    (a, b) =>
      b.priorContributions - a.priorContributions ||
      (ROLE_RANK[b.role] ?? 0) - (ROLE_RANK[a.role] ?? 0),
  );
  return result.slice(0, cap);
}

export type UnactivatedNewcomer = { userId: string; joinedAt: Date };

export function selectUnactivated(opts: {
  memberships: MembershipRow[];
  contributorUserIds: Iterable<string>; // distinct userIds who have EVER contributed to this community
  now: Date;
  minAgeDays: number; // joined at least this long ago (default caller: 3)
  maxAgeDays: number; // joined at most this long ago (default caller: 30)
}): UnactivatedNewcomer[] {
  const { memberships, contributorUserIds, now, minAgeDays, maxAgeDays } = opts;
  const youngCutoff = windowStart(now, minAgeDays); // joined on/before this = old enough
  const oldCutoff = windowStart(now, maxAgeDays); // joined on/after this = recent enough
  const everContributed = new Set<string>(contributorUserIds);

  return memberships
    .filter(
      (m) =>
        m.status === "active" &&
        m.joinedAt <= youngCutoff &&
        m.joinedAt >= oldCutoff &&
        !everContributed.has(m.userId),
    )
    .map((m) => ({ userId: m.userId, joinedAt: m.joinedAt }))
    .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime());
}
