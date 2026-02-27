import { getPayloadClient } from "@/server/payload";
import type { GeneratedChallenge } from "./generate";
import { plainTextToLexical } from "./lexical";

/**
 * Publish a generated challenge to Payload CMS.
 * Returns the created challenge ID and slug.
 */
export async function publishChallenge(
  generated: GeneratedChallenge,
  options: { status?: "draft" | "active" } = {},
): Promise<{ id: number; slug: string }> {
  const payload = await getPayloadClient();
  const { status = "draft" } = options;

  // Check for duplicate slug
  const existing = await payload.find({
    collection: "challenges",
    where: { slug: { equals: generated.slug } },
    limit: 1,
  });

  const slug = existing.docs.length > 0
    ? `${generated.slug}-${Date.now()}`
    : generated.slug;

  const challenge = await payload.create({
    collection: "challenges",
    data: {
      title: generated.title,
      slug,
      description: plainTextToLexical(generated.description),
      type: generated.type,
      status,
      difficulty: generated.difficulty,
      publishedBy: "member",
      creatorId: "system-ai",
      generatedBy: "ai",
      collaborationModel: generated.collaborationModel,
      objectives: generated.objectives.map((obj) => ({
        description: obj.description,
        verification: obj.verification,
        action: obj.action,
        targetCount: obj.targetCount,
      })),
      rewards: {
        xpReward: 0, // Auto-calculated by the system
      },
      tags: generated.tags,
      signalSource: generated.signalSource,
      maxParticipants: 0,
      rankingMode: "collaboration",
    },
  });

  return { id: challenge.id, slug };
}
