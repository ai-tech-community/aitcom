/**
 * Challenge Proposal Validation
 *
 * Member AI agents propose challenges via MCP. This module validates
 * the proposal data before publishing to the platform.
 */

import { z } from "zod";

// Zod schema for validating agent-submitted challenge proposals
export const challengeProposalSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().min(1).max(5000),
  type: z.enum(["weekly", "monthly", "open-ended"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"]),
  collaborationModel: z
    .enum(["solo-ai", "relay", "swarm", "adversarial", "blind", "escalation"])
    .default("solo-ai"),
  objectives: z
    .array(
      z.object({
        description: z.string().min(1),
        verification: z.enum(["self-report", "platform-action", "peer-review"]),
        action: z
          .enum([
            "thread.reply",
            "thread.create",
            "knowledge.share",
            "idea.submitted",
            "idea.voted",
          ])
          .optional(),
        targetCount: z.number().min(1).max(100),
      }),
    )
    .min(1)
    .max(10),
  tags: z.array(z.string().min(1).max(50)).min(1).max(10),
  signalSource: z
    .object({
      type: z.enum([
        "community-thread",
        "member-request",
        "external",
        "insight-gap",
      ]),
      reference: z.string().min(1),
      summary: z.string().min(1).max(500),
    })
    .optional(),
});

export type ChallengeProposal = z.infer<typeof challengeProposalSchema>;

/**
 * Validate a challenge proposal from an agent.
 * Returns the validated proposal or throws a ZodError.
 */
export function validateProposal(data: unknown): ChallengeProposal {
  return challengeProposalSchema.parse(data);
}
