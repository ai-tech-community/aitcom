import { z } from "zod";

/** Where a join started. Communities owns one variant per source surface. */
export type MagazineJoinSource = {
  via: "magazine";
  magazineId: number;
  issueId: number;
};

export type JoinSource = MagazineJoinSource;

export const joinSourceSchema: z.ZodType<JoinSource> = z.discriminatedUnion(
  "via",
  [
    z.object({
      via: z.literal("magazine"),
      magazineId: z.number().int().positive(),
      issueId: z.number().int().positive(),
    }),
  ],
);
