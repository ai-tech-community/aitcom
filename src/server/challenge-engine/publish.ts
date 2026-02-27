import { getPayloadClient } from "@/server/payload";
import type { ChallengeProposal } from "./generate";
import { plainTextToLexical } from "./lexical";

/**
 * Publish a challenge proposal to Payload CMS.
 * Returns the created challenge ID and slug.
 */
export async function publishChallenge(
  proposal: ChallengeProposal,
  options: { status?: "draft" | "active"; creatorId?: string } = {},
): Promise<{ id: number; slug: string }> {
  const payload = await getPayloadClient();
  const { status = "draft", creatorId = "agent" } = options;

  // Check for duplicate slug
  const existing = await payload.find({
    collection: "challenges",
    where: { slug: { equals: proposal.slug } },
    limit: 1,
  });

  const slug = existing.docs.length > 0
    ? `${proposal.slug}-${Date.now()}`
    : proposal.slug;

  const challenge = await payload.create({
    collection: "challenges",
    data: {
      title: proposal.title,
      slug,
      description: plainTextToLexical(proposal.description),
      type: proposal.type,
      status,
      difficulty: proposal.difficulty,
      publishedBy: "member",
      creatorId,
      generatedBy: "ai",
      collaborationModel: proposal.collaborationModel,
      objectives: proposal.objectives.map((obj) => ({
        description: obj.description,
        verification: obj.verification,
        action: obj.action,
        targetCount: obj.targetCount,
      })),
      rewards: {
        xpReward: 0, // Auto-calculated by the system
      },
      tags: proposal.tags,
      signalSource: proposal.signalSource,
      maxParticipants: 0,
      rankingMode: "collaboration",
    },
  });

  return { id: challenge.id, slug };
}
