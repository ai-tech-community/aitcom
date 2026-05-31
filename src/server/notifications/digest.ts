export type CommunitySectionInput = {
  communityId: string;
  communityName: string;
  newThreads: number;
  newEvents: number;
  newMembers: number;
  /** Ritual / revival items — typed slot Slice C (Engage) fills. Empty in B. */
  ritualItems: string[];
};

export type CommunitySection = CommunitySectionInput & { isEmpty: boolean };

export function summarizeCommunitySection(
  input: CommunitySectionInput,
): CommunitySection {
  const isEmpty =
    input.newThreads === 0 &&
    input.newEvents === 0 &&
    input.newMembers === 0 &&
    input.ritualItems.length === 0;
  return { ...input, isEmpty };
}

export type HubDigest = { userId: string; sections: CommunitySection[] };

/** Assemble a member's consolidated digest: drop empty sections and sections
 *  the member opted out of. Returns null when nothing survives (suppress the
 *  whole email). */
export function buildHubDigest(opts: {
  userId: string;
  sections: CommunitySection[];
  optedOutCommunityIds: Set<string>;
}): HubDigest | null {
  const visible = opts.sections.filter(
    (s) => !s.isEmpty && !opts.optedOutCommunityIds.has(s.communityId),
  );
  if (visible.length === 0) return null;
  return { userId: opts.userId, sections: visible };
}
