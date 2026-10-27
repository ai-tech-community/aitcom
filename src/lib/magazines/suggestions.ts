import { z } from "zod";

export type SuggestionReason =
  | { type: "waitingSince"; at: string }
  | { type: "topic"; topic: string }
  | { type: "eventComingUp"; at: string }
  | { type: "eventRecap"; at: string; going: number }
  | { type: "mostReplies"; count: number }
  | { type: "mostUpvotes"; count: number }
  | { type: "newMembers"; count: number };

export const suggestionReasonSchema: z.ZodType<SuggestionReason> =
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("waitingSince"), at: z.string() }),
    z.object({ type: z.literal("topic"), topic: z.string() }),
    z.object({ type: z.literal("eventComingUp"), at: z.string() }),
    z.object({
      type: z.literal("eventRecap"),
      at: z.string(),
      going: z.number().int().nonnegative(),
    }),
    z.object({
      type: z.literal("mostReplies"),
      count: z.number().int().nonnegative(),
    }),
    z.object({
      type: z.literal("mostUpvotes"),
      count: z.number().int().nonnegative(),
    }),
    z.object({
      type: z.literal("newMembers"),
      count: z.number().int().nonnegative(),
    }),
  ]);

/** The stored reason, or null when it is not one we know (an old or broken row). */
export function parseSuggestionReason(value: unknown): SuggestionReason | null {
  const parsed = suggestionReasonSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
