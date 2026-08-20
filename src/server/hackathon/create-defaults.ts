// Pure builders for the one-shot community hackathon scaffold (ADR-0032).
// Db-free and Payload-free so the default mapping is unit-testable in isolation.
import { slugify } from "@/lib/text-utils";

/** Slugify a name and append a uniqueness suffix the caller supplies. */
export function deriveSlug(name: string, suffix: string): string {
  return `${slugify(name).slice(0, 80)}-${suffix}`;
}

interface ChallengeDataArgs {
  name: string;
  descriptionLexical: unknown; // richText (lexical) JSON from plainTextToLexical
  communityId: string;
  userId: string;
  slug: string;
  teamMin: number;
  teamMax: number;
}

/**
 * The Payload `challenges` create payload for a hackathon scaffold: a draft
 * challenge with empty objectives + empty cellTemplate. The admin fills the
 * cellTemplate in the in-app editor afterward.
 */
export function buildHackathonChallengeData(args: ChallengeDataArgs) {
  return {
    title: args.name,
    slug: args.slug,
    description: args.descriptionLexical,
    type: "open-ended" as const,
    status: "draft" as const,
    difficulty: "intermediate" as const,
    creatorId: args.userId,
    publishedBy: "member" as const,
    communityId: args.communityId,
    objectives: [] as unknown[],
    cellTemplate: [] as unknown[],
    // Empty array — not null. A null JSON `tags` value crashes the Payload
    // admin editor (blank form body) and makes bulk status save fail silently.
    tags: [] as string[],
    rewards: { xpReward: 0 },
    teamConfig: { minTeamSize: args.teamMin, maxTeamSize: args.teamMax },
  };
}
