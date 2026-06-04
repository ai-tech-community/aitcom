import { z } from "zod";

/**
 * Input schema for `workGridRouter.createCollaborativeGrid`. Lives in its own
 * db-free module (no `@/server/db` imports) so the scoping refinement can be
 * asserted in a plain unit test without opening a database connection.
 *
 * The refinement is a security firebreak (ADR-0022): a grid must be scoped to
 * EXACTLY ONE of a challenge or a community. An unscoped grid would skip all
 * authz (`requireGridAdmin` only runs after a valid input) and enable
 * self-minted XP, so both-null and both-set are rejected here.
 */
export const createCollaborativeGridSchema = z
  .object({
    challengeId: z.number().optional(),
    communityId: z.string().optional(),
    cells: z
      .array(
        z.object({
          taskType: z.string(),
          verificationMode: z
            .enum([
              "platform-action",
              "test",
              "self-report",
              "peer-review",
              "consensus",
            ])
            .default("self-report"),
          deadlineMinutes: z.number().int().positive().default(60),
        }),
      )
      .min(1),
  })
  // A grid must be scoped to EXACTLY ONE of a challenge or a community —
  // an unscoped grid skips all authz and would enable self-minted XP.
  .refine(
    (v) => (v.challengeId !== undefined) !== (v.communityId !== undefined),
    {
      message:
        "Provide exactly one of challengeId or communityId to scope the grid",
    },
  );
