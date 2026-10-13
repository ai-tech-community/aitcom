import type { DigestSection } from "./prefs";

export type DigestHighlight = {
  title: string;
  path: string;
  kind: "thread" | "post";
};

export type CommunitySectionInput = {
  communityId: string;
  communityName: string;
  newThreads: number;
  newEvents: number;
  newMembers: number;
  /** Ritual / revival items — typed slot Slice C (Engage) fills. Empty in B. */
  ritualItems: string[];
  /** Top threads and posts. These replace the bare activity counts. */
  highlights?: DigestHighlight[];
};

export type CommunitySection = CommunitySectionInput & {
  highlights: DigestHighlight[];
  isEmpty: boolean;
};

export function summarizeCommunitySection(
  input: CommunitySectionInput,
): CommunitySection {
  const highlights = input.highlights ?? [];
  const isEmpty = highlights.length === 0 && input.ritualItems.length === 0;
  return { ...input, highlights, isEmpty };
}

export type DiscoveryPick = { name: string; slug: string } | null;

export type DigestEventItem = {
  title: string;
  path: string;
  when: string;
};

export type DigestJobItem = {
  title: string;
  path: string;
  company: string;
};

export type DigestStartupItem = {
  title: string;
  path: string;
  votes: number;
};

export type HubDigest = {
  userId: string;
  sections: CommunitySection[];
  events: DigestEventItem[];
  jobs: DigestJobItem[];
  startups: DigestStartupItem[];
  discovery: DiscoveryPick;
};

/** Assemble a member's consolidated digest. Empty sections and opted-out
 *  sections are dropped. Returns null when nothing survives (suppress the
 *  whole email). */
export function buildHubDigest(opts: {
  userId: string;
  sections: CommunitySection[];
  events?: DigestEventItem[];
  jobs?: DigestJobItem[];
  startups?: DigestStartupItem[];
  optedOutCommunityIds: Set<string>;
  optedOutSections?: ReadonlySet<DigestSection>;
  discovery?: DiscoveryPick;
}): HubDigest | null {
  const off = opts.optedOutSections;
  const visible = off?.has("community")
    ? []
    : opts.sections.filter(
        (section) =>
          !section.isEmpty &&
          !opts.optedOutCommunityIds.has(section.communityId),
      );
  const events = off?.has("events") ? [] : (opts.events ?? []);
  const jobs = off?.has("jobs") ? [] : (opts.jobs ?? []);
  const startups = off?.has("startups") ? [] : (opts.startups ?? []);
  const discovery = opts.discovery ?? null;
  if (
    visible.length === 0 &&
    events.length === 0 &&
    jobs.length === 0 &&
    startups.length === 0 &&
    !discovery
  ) {
    return null;
  }
  return {
    userId: opts.userId,
    sections: visible,
    events,
    jobs,
    startups,
    discovery,
  };
}
