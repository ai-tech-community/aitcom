/** Pure activation funnel logic. No DB, no clock — `now` injected. */

export const RESPONSE_ACTIONS = [
  "thread.reply",
  "feed.comment_created",
  "launchpad.comment.created",
] as const;

export type ActivationStage =
  | "unactivated"
  | "awaiting_response"
  | "awaiting_profile"
  | "activated"
  | "stalled";

export type ActivationConfig = {
  requireResponse: boolean;
  requireProfileComplete: boolean;
  windowDays: number;
};

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/** The activation stage for one member, given their signals + the community config. */
export function computeActivationStage(opts: {
  firstContributionAt: Date | null;
  firstResponseReceivedAt: Date | null;
  profileComplete: boolean;
  config: ActivationConfig;
  now: Date;
}): ActivationStage {
  const {
    firstContributionAt,
    firstResponseReceivedAt,
    profileComplete,
    config,
    now,
  } = opts;
  if (!firstContributionAt) return "unactivated";

  const deadline = addDays(firstContributionAt, config.windowDays);
  const responseOk =
    !config.requireResponse ||
    (firstResponseReceivedAt !== null && firstResponseReceivedAt <= deadline);
  const profileOk = !config.requireProfileComplete || profileComplete;

  if (responseOk && profileOk) return "activated";
  if (!responseOk) return now <= deadline ? "awaiting_response" : "stalled";
  return "awaiting_profile";
}

export type FunnelMemberInput = {
  userId: string;
  joinedAt: Date;
  firstContributionAt: Date | null;
  firstResponseReceivedAt: Date | null;
  profileComplete: boolean;
};

export type ActivationFunnel = {
  cohortSize: number;
  contributed: number;
  responded: number;
  activated: number;
  byStage: Record<ActivationStage, number>;
};

/** Aggregate the newcomer cohort into funnel counts + per-stage tallies. */
export function selectActivationFunnel(opts: {
  members: FunnelMemberInput[];
  config: ActivationConfig;
  now: Date;
}): ActivationFunnel {
  const byStage: Record<ActivationStage, number> = {
    unactivated: 0,
    awaiting_response: 0,
    awaiting_profile: 0,
    activated: 0,
    stalled: 0,
  };
  let contributed = 0;
  let responded = 0;
  let activated = 0;
  for (const m of opts.members) {
    if (m.firstContributionAt) contributed++;
    if (
      m.firstContributionAt &&
      m.firstResponseReceivedAt !== null &&
      m.firstResponseReceivedAt <=
        addDays(m.firstContributionAt, opts.config.windowDays)
    ) {
      responded++;
    }
    const stage = computeActivationStage({
      firstContributionAt: m.firstContributionAt,
      firstResponseReceivedAt: m.firstResponseReceivedAt,
      profileComplete: m.profileComplete,
      config: opts.config,
      now: opts.now,
    });
    byStage[stage]++;
    if (stage === "activated") activated++;
  }
  return {
    cohortSize: opts.members.length,
    contributed,
    responded,
    activated,
    byStage,
  };
}
